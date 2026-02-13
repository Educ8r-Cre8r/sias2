/**
 * SIAS Admin Dashboard — Content Editor
 * Structured editor for educational content with per-section textareas.
 * Supports grade-level lesson content (K-5) and EDP content.
 */

// ============================================================
// Constants
// ============================================================

const CONTENT_GRADE_TABS = [
    { key: 'kindergarten', label: 'K' },
    { key: 'first-grade', label: '1st' },
    { key: 'second-grade', label: '2nd' },
    { key: 'third-grade', label: '3rd' },
    { key: 'fourth-grade', label: '4th' },
    { key: 'fifth-grade', label: '5th' },
    { key: 'edp', label: 'EDP' }
];

const GRADE_SECTIONS = [
    { key: 'photoDescription', header: '## 📸 Photo Description', label: 'Photo Description' },
    { key: 'phenomena', header: '## 🔬 Scientific Phenomena', label: 'Scientific Phenomena' },
    { key: 'coreConcepts', header: '## 📚 Core Science Concepts', label: 'Core Science Concepts' },
    { key: 'pedagogicalTip', label: 'Pedagogical Tip', nested: true },
    { key: 'udlSuggestions', label: 'UDL Suggestions', nested: true },
    { key: 'zoomInOut', header: '## 🔍 Zoom In / Zoom Out', label: 'Zoom In / Zoom Out' },
    { key: 'misconceptions', header: '## 🤔 Potential Student Misconceptions', label: 'Potential Student Misconceptions' },
    { key: 'ngss', header: '## 🎓 NGSS Connections', label: 'NGSS Connections' },
    { key: 'discussion', header: '## 💬 Discussion Questions', label: 'Discussion Questions' },
    { key: 'vocabulary', header: '## 📖 Science Vocabulary', label: 'Science Vocabulary' },
    { key: 'extensionActivities', header: '## 🌡️ Extension Activities', label: 'Extension Activities', optional: true },
    { key: 'crossCurricular', header: '## 🔗 Cross-Curricular Ideas', label: 'Cross-Curricular Ideas' },
    { key: 'stemCareers', header: '## 🚀 STEM Career Connection', label: 'STEM Career Connection' },
    { key: 'resources', header: '## 📚 External Resources', label: 'External Resources' }
];

const EDP_SECTIONS = [
    { key: 'visibleElements', header: '### Visible Elements in Photo', label: 'Visible Elements in Photo' },
    { key: 'inferences', header: '### Reasonable Inferences', label: 'Reasonable Inferences' },
    { key: 'taskK2', label: 'Engineering Task (K-2)' },
    { key: 'taskG35', label: 'Engineering Task (3-5)' },
    { key: 'edpPhase', header: '### EDP Phase Targeted', label: 'EDP Phase Targeted' },
    { key: 'materials', header: '### Suggested Materials', label: 'Suggested Materials' },
    { key: 'time', header: '### Estimated Time', label: 'Estimated Time' },
    { key: 'whyItWorks', header: '### Why This Works for Teachers', label: 'Why This Works for Teachers' }
];

// ============================================================
// State
// ============================================================

let contentEditorState = {
    active: false,
    imageId: null,
    image: null,
    currentGrade: null,
    originalContent: {},  // { gradeKey: markdownString } — originals for dirty check
    hasUnsavedChanges: false
};

// ============================================================
// Markdown Parsing (mirrors functions/pdf-generator.js parseSections)
// ============================================================

function parseGradeSections(markdown) {
    if (!markdown) return {};
    const result = {};

    const patterns = [
        { key: 'photoDescription', regex: /##\s*📸\s*Photo Description\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'phenomena',        regex: /##\s*🔬\s*Scientific Phenomena\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'coreConcepts',     regex: /##\s*📚\s*Core Science Concepts\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'zoomInOut',        regex: /##\s*🔍\s*Zoom In\s*\/\s*Zoom Out.*?\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'misconceptions',   regex: /##\s*🤔\s*Potential Student Misconceptions\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'ngss',             regex: /##\s*🎓\s*NGSS Connections\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'discussion',       regex: /##\s*💬\s*Discussion Questions\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'vocabulary',       regex: /##\s*📖\s*(?:Science\s+)?Vocabulary\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'extensionActivities', regex: /##\s*🌡️?\s*Extension Activities\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'crossCurricular',  regex: /##\s*🔗\s*Cross-Curricular Ideas\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'stemCareers',      regex: /##\s*🚀\s*STEM Career Connection\s*\n([\s\S]*?)(?=\n##\s|$)/ },
        { key: 'resources',        regex: /##\s*📚\s*External Resources\s*\n([\s\S]*?)(?=\n##\s|$)/ }
    ];

    for (const { key, regex } of patterns) {
        const match = markdown.match(regex);
        result[key] = match ? match[1].trim() : '';
    }

    // Extract pedagogical tip and UDL suggestions from core concepts
    if (result.coreConcepts) {
        const tipMatch = result.coreConcepts.match(/<pedagogical-tip>([\s\S]*?)<\/pedagogical-tip>/);
        const udlMatch = result.coreConcepts.match(/<udl-suggestions>([\s\S]*?)<\/udl-suggestions>/);
        result.pedagogicalTip = tipMatch ? tipMatch[1].trim() : '';
        result.udlSuggestions = udlMatch ? udlMatch[1].trim() : '';
        // Remove tags from core concepts body
        result.coreConcepts = result.coreConcepts
            .replace(/<pedagogical-tip>[\s\S]*?<\/pedagogical-tip>/, '')
            .replace(/<udl-suggestions>[\s\S]*?<\/udl-suggestions>/, '')
            .trim();
    }

    return result;
}

// Mirrors functions/edp-pdf-generator.js parseEDPSections
function parseEDPContentSections(markdown) {
    if (!markdown) return {};
    const result = {};

    const patterns = [
        { key: 'visibleElements', regex: /#{2,3}\s*Visible Elements in Photo\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
        { key: 'inferences',      regex: /#{2,3}\s*Reasonable Inferences\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
        { key: 'engineeringTask',  regex: /#{2,3}\s*Engineering Task\s*\n([\s\S]*?)(?=\n#{2,3}\s[A-Z]|$)/ },
        { key: 'edpPhase',        regex: /#{2,3}\s*EDP Phase Targeted\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
        { key: 'materials',       regex: /#{2,3}\s*Suggested Materials\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
        { key: 'time',            regex: /#{2,3}\s*Estimated Time\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
        { key: 'whyItWorks',      regex: /#{2,3}\s*Why This Works for Teachers\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ }
    ];

    for (const { key, regex } of patterns) {
        const match = markdown.match(regex);
        result[key] = match ? match[1].trim() : '';
    }

    // Extract K-2 and 3-5 tasks from engineering task
    if (result.engineeringTask) {
        result.taskK2 = extractGradeBandTask(result.engineeringTask, 'K') || '';
        result.taskG35 = extractGradeBandTask(result.engineeringTask, '3') || '';
    }

    return result;
}

// Mirrors functions/edp-pdf-generator.js extractGradeBandTask
function extractGradeBandTask(text, band) {
    if (!text) return null;
    const bandLabel = band === 'K' ? 'K[–\\-]2' : '3[–\\-]5';

    // Format 1: inline - **K-2**: "task text"
    const inlineRegex = new RegExp(`\\*\\*${bandLabel}\\*\\*:\\s*(.+?)(?=\\n|$)`);
    const inlineMatch = text.match(inlineRegex);
    if (inlineMatch) return inlineMatch[1].trim().replace(/^["""]|["""]$/g, '');

    // Format 2: sub-header ### K-2\n<paragraphs>
    const subHeaderRegex = new RegExp(`#{2,3}\\s*${bandLabel}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|\\n---|-\\*\\*|$)`);
    const subHeaderMatch = text.match(subHeaderRegex);
    if (subHeaderMatch && subHeaderMatch[1].trim()) return subHeaderMatch[1].trim();

    // Format 3: bold label **K-2 Version:**\n<paragraphs>
    const boldLabelRegex = new RegExp(`\\*\\*${bandLabel}[^*]*\\*\\*[:\\s]*\\n([\\s\\S]*?)(?=\\n\\*\\*[0-9K]|\\n#{2,3}\\s|\\n---|$)`);
    const boldLabelMatch = text.match(boldLabelRegex);
    if (boldLabelMatch && boldLabelMatch[1].trim()) return boldLabelMatch[1].trim();

    return null;
}

// ============================================================
// Markdown Reassembly
// ============================================================

function reassembleGradeMarkdown(sections) {
    const parts = [];

    const sectionOrder = [
        { key: 'photoDescription', header: '## 📸 Photo Description' },
        { key: 'phenomena', header: '## 🔬 Scientific Phenomena' },
        { key: 'coreConcepts', header: '## 📚 Core Science Concepts', hasTags: true },
        { key: 'zoomInOut', header: '## 🔍 Zoom In / Zoom Out Concepts' },
        { key: 'misconceptions', header: '## 🤔 Potential Student Misconceptions' },
        { key: 'ngss', header: '## 🎓 NGSS Connections' },
        { key: 'discussion', header: '## 💬 Discussion Questions' },
        { key: 'vocabulary', header: '## 📖 Science Vocabulary' },
        { key: 'extensionActivities', header: '## 🌡️ Extension Activities', optional: true },
        { key: 'crossCurricular', header: '## 🔗 Cross-Curricular Ideas' },
        { key: 'stemCareers', header: '## 🚀 STEM Career Connection' },
        { key: 'resources', header: '## 📚 External Resources' }
    ];

    for (const def of sectionOrder) {
        const text = (sections[def.key] || '').trim();
        if (!text && def.optional) continue;

        let body = text;

        // Re-insert pedagogical tip and UDL suggestions into Core Concepts
        if (def.hasTags) {
            const tip = (sections.pedagogicalTip || '').trim();
            const udl = (sections.udlSuggestions || '').trim();
            if (tip) body += '\n\n<pedagogical-tip>' + tip + '</pedagogical-tip>';
            if (udl) body += '\n\n<udl-suggestions>' + udl + '</udl-suggestions>';
        }

        parts.push(def.header + '\n\n' + body);
    }

    return parts.join('\n\n');
}

function reassembleEDPMarkdown(sections) {
    const parts = ['# Engineering Design Process Challenge'];

    parts.push('### Visible Elements in Photo\n\n' + (sections.visibleElements || '').trim());
    parts.push('### Reasonable Inferences\n\n' + (sections.inferences || '').trim());

    // Reassemble Engineering Task with K-2 and 3-5 sub-sections
    let taskBody = '';
    const k2 = (sections.taskK2 || '').trim();
    const g35 = (sections.taskG35 || '').trim();
    if (k2) taskBody += '**K–2 Version:**\n' + k2;
    if (k2 && g35) taskBody += '\n\n';
    if (g35) taskBody += '**3–5 Version:**\n' + g35;
    parts.push('### Engineering Task\n\n' + taskBody);

    parts.push('### EDP Phase Targeted\n\n' + (sections.edpPhase || '').trim());
    parts.push('### Suggested Materials\n\n' + (sections.materials || '').trim());
    parts.push('### Estimated Time\n\n' + (sections.time || '').trim());
    parts.push('### Why This Works for Teachers\n\n' + (sections.whyItWorks || '').trim());

    return parts.join('\n\n');
}

// ============================================================
// Content Loading
// ============================================================

async function loadGradeContent(image, gradeKey) {
    const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
    const suffix = gradeKey === 'edp' ? 'edp' : gradeKey;
    const contentPath = `../content/${image.category}/${nameNoExt}-${suffix}.json`;

    try {
        const response = await fetch(contentPath);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('Failed to load content:', e);
        return null;
    }
}

// ============================================================
// UI Rendering
// ============================================================

function initContentEditor(imageId) {
    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    contentEditorState = {
        active: true,
        imageId,
        image,
        currentGrade: null,
        originalContent: {},
        hasUnsavedChanges: false
    };

    const container = document.getElementById('content-editor-container');
    if (!container) return;

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="content-editor">
            <div class="content-editor-header">
                <h3>Edit Educational Content</h3>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-small btn-secondary" id="version-history-btn" onclick="showVersionHistory()" disabled>Version History</button>
                    <button class="btn btn-small btn-outline" onclick="closeContentEditor()">Close Editor</button>
                </div>
            </div>
            <div class="content-editor-tabs" id="content-grade-tabs">
                ${CONTENT_GRADE_TABS.map(t => `
                    <button class="pill" data-grade="${t.key}" onclick="switchGradeTab('${t.key}')">${t.label}</button>
                `).join('')}
            </div>
            <div id="content-form-area">
                <p class="text-muted">Select a grade level to begin editing.</p>
            </div>
        </div>
    `;

    // Scroll to editor
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function switchGradeTab(gradeKey) {
    // Warn about unsaved changes
    if (contentEditorState.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them and switch grades?')) return;
    }

    const isEDP = gradeKey === 'edp';
    contentEditorState.currentGrade = gradeKey;
    contentEditorState.hasUnsavedChanges = false;

    // Update tab active state
    document.querySelectorAll('#content-grade-tabs .pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.grade === gradeKey);
    });

    const formArea = document.getElementById('content-form-area');
    formArea.innerHTML = '<p class="text-muted">Loading content...</p>';

    const contentData = await loadGradeContent(contentEditorState.image, gradeKey);

    if (!contentData || !contentData.content) {
        formArea.innerHTML = '<p class="text-muted">No content available for this grade level.</p>';
        return;
    }

    // Store original for dirty checking
    contentEditorState.originalContent[gradeKey] = contentData.content;

    const sections = isEDP
        ? parseEDPContentSections(contentData.content)
        : parseGradeSections(contentData.content);

    const sectionDefs = isEDP ? EDP_SECTIONS : GRADE_SECTIONS;

    renderContentForm(formArea, sections, sectionDefs, isEDP);

    // Enable version history button now that a grade is selected
    const vhBtn = document.getElementById('version-history-btn');
    if (vhBtn) vhBtn.disabled = false;
}

function renderContentForm(container, sections, sectionDefs, isEDP) {
    const fields = sectionDefs.map(def => {
        const value = sections[def.key] || '';
        const rows = Math.max(3, Math.min(12, value.split('\n').length + 1));
        const nestedClass = def.nested ? ' nested' : '';
        const optionalLabel = def.optional ? ' <span class="text-muted">(optional)</span>' : '';

        return `
            <div class="content-section-field${nestedClass}">
                <label for="content-field-${def.key}">${escapeHtml(def.label)}${optionalLabel}</label>
                <textarea id="content-field-${def.key}" data-key="${def.key}" rows="${rows}"
                    oninput="contentEditorState.hasUnsavedChanges = true"
                >${escapeHtml(value)}</textarea>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="content-section-group">
            ${fields}
        </div>
        <div class="content-editor-actions">
            <span id="content-save-status" class="text-muted" style="margin-right: auto;"></span>
            <button class="btn btn-outline" onclick="cancelContentEdit()">Cancel</button>
            <button class="btn btn-primary" id="content-save-btn" onclick="saveContentEdits()">Save &amp; Regenerate PDF</button>
        </div>
    `;
}

// ============================================================
// Validation
// ============================================================

function collectFormSections(isEDP) {
    const sectionDefs = isEDP ? EDP_SECTIONS : GRADE_SECTIONS;
    const sections = {};
    for (const def of sectionDefs) {
        const textarea = document.getElementById('content-field-' + def.key);
        sections[def.key] = textarea ? textarea.value : '';
    }
    return sections;
}

function validateSections(sections, isEDP) {
    const errors = [];
    const sectionDefs = isEDP ? EDP_SECTIONS : GRADE_SECTIONS;

    for (const def of sectionDefs) {
        if (def.optional || def.nested) continue;
        const val = (sections[def.key] || '').trim();
        if (!val) {
            errors.push(def.label + ' cannot be empty');
            // Highlight the field
            const textarea = document.getElementById('content-field-' + def.key);
            if (textarea) textarea.style.borderColor = 'var(--danger)';
        }
    }

    return errors;
}

// ============================================================
// Save
// ============================================================

async function saveContentEdits() {
    const { imageId, currentGrade, image } = contentEditorState;
    if (!currentGrade || !image) return;

    const isEDP = currentGrade === 'edp';
    const sections = collectFormSections(isEDP);

    // Reset border colors
    document.querySelectorAll('.content-section-field textarea').forEach(ta => {
        ta.style.borderColor = '';
    });

    // Validate
    const errors = validateSections(sections, isEDP);
    if (errors.length > 0) {
        showToast(errors[0], 'error');
        return;
    }

    // Reassemble markdown
    const newContent = isEDP
        ? reassembleEDPMarkdown(sections)
        : reassembleGradeMarkdown(sections);

    // Check if anything actually changed
    if (newContent.trim() === (contentEditorState.originalContent[currentGrade] || '').trim()) {
        showToast('No changes to save', 'info');
        return;
    }

    // Disable save button, show status
    const saveBtn = document.getElementById('content-save-btn');
    const statusEl = document.getElementById('content-save-status');
    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Saving & regenerating PDF... this may take a minute.';

    try {
        const editFn = firebase.functions().httpsCallable('adminEditContent');
        const result = await editFn({
            imageId,
            gradeLevel: currentGrade,
            content: newContent
        });

        if (result.data && result.data.success) {
            contentEditorState.hasUnsavedChanges = false;
            contentEditorState.originalContent[currentGrade] = newContent;

            if (result.data.pdfWarning) {
                showToast('Content saved! Warning: PDF regeneration failed.', 'warning', 6000);
            } else {
                showToast('Content saved & PDF regenerated!', 'success');
            }

            if (statusEl) statusEl.textContent = '';
        }
    } catch (error) {
        console.error('Save content error:', error);
        showToast('Save failed: ' + (error.message || 'Unknown error'), 'error');
        if (statusEl) statusEl.textContent = 'Save failed.';
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ============================================================
// Cancel / Close
// ============================================================

function cancelContentEdit() {
    if (contentEditorState.hasUnsavedChanges) {
        if (!confirm('Discard unsaved changes?')) return;
    }

    // Reload original content for current grade
    if (contentEditorState.currentGrade) {
        switchGradeTab(contentEditorState.currentGrade);
    }
    contentEditorState.hasUnsavedChanges = false;
}

function closeContentEditor() {
    if (contentEditorState.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Close editor anyway?')) return;
    }

    contentEditorState = {
        active: false,
        imageId: null,
        image: null,
        currentGrade: null,
        originalContent: {},
        hasUnsavedChanges: false
    };

    const container = document.getElementById('content-editor-container');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

// ============================================================
// Version History
// ============================================================

async function showVersionHistory() {
    const { imageId, currentGrade, image } = contentEditorState;
    if (!currentGrade || !image) {
        showToast('Select a grade level first', 'warning');
        return;
    }

    const modal = document.getElementById('version-history-modal');
    const title = document.getElementById('version-history-title');
    const body = document.getElementById('version-history-body');

    const gradeLabel = currentGrade === 'edp' ? 'EDP'
        : CONTENT_GRADE_TABS.find(t => t.key === currentGrade)?.label || currentGrade;

    title.textContent = `Version History — ${escapeHtml(image.title || image.filename)} (${gradeLabel})`;
    body.innerHTML = '<div style="text-align:center; padding: 40px;"><div class="spinner spinner-large" style="margin: 0 auto 12px;"></div><p class="text-muted">Loading version history...</p></div>';
    modal.classList.remove('hidden');

    try {
        const fn = firebase.functions().httpsCallable('adminGetContentHistory');
        const result = await fn({ imageId, gradeLevel: currentGrade });
        const versions = result.data.versions || [];

        if (versions.length === 0) {
            body.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px;">No version history available for this file.</p><div style="text-align:right; margin-top: 16px;"><button class="btn btn-secondary" onclick="closeVersionHistoryModal()">Close</button></div>';
            return;
        }

        const listHtml = versions.map((v, i) => {
            const date = new Date(v.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
            const isCurrent = i === 0;
            return `
                <div class="version-item">
                    <div class="version-meta">
                        <div class="version-date">${dateStr}${isCurrent ? ' <span class="badge badge-success" style="font-size:0.7rem;">Current</span>' : ''}</div>
                        <div class="version-message">${escapeHtml(v.message)}</div>
                    </div>
                    <div class="version-hash">${v.hash.slice(0, 7)}</div>
                    <div class="version-actions">
                        <button class="btn btn-small btn-outline" onclick="previewVersion('${v.hash}', '${dateStr.replace(/'/g, "\\'")}')">Preview</button>
                        ${!isCurrent ? `<button class="btn btn-small btn-secondary" onclick="confirmRestore('${v.hash}', '${dateStr.replace(/'/g, "\\'")}')">Restore</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        body.innerHTML = `
            <div class="version-list">${listHtml}</div>
            <div style="text-align:right; margin-top: 16px;">
                <button class="btn btn-secondary" onclick="closeVersionHistoryModal()">Close</button>
            </div>
        `;
    } catch (error) {
        console.error('Version history error:', error);
        body.innerHTML = `<p class="text-danger" style="text-align:center; padding: 40px;">Failed to load history: ${escapeHtml(error.message)}</p><div style="text-align:right; margin-top: 16px;"><button class="btn btn-secondary" onclick="closeVersionHistoryModal()">Close</button></div>`;
    }
}

async function previewVersion(commitHash, dateLabel) {
    const { imageId, currentGrade } = contentEditorState;
    const body = document.getElementById('version-history-body');

    // Show loading in the preview area
    body.innerHTML += '<div id="version-preview-loading" style="text-align:center; padding: 20px;"><div class="spinner" style="margin: 0 auto 8px;"></div><p class="text-muted">Loading version...</p></div>';

    try {
        const fn = firebase.functions().httpsCallable('adminGetContentVersion');
        const result = await fn({ imageId, gradeLevel: currentGrade, commitHash });
        const oldContent = result.data.content || '';

        // Get current content from the editor form (or original)
        const isEDP = currentGrade === 'edp';
        const currentContent = contentEditorState.originalContent[currentGrade] || '';

        // Remove loading indicator
        const loadingEl = document.getElementById('version-preview-loading');
        if (loadingEl) loadingEl.remove();

        // Add or replace preview pane
        let previewPane = document.getElementById('version-preview-pane');
        if (previewPane) previewPane.remove();

        const paneHtml = `
            <div id="version-preview-pane" class="version-preview-pane">
                <div class="preview-col">
                    <h4>Current Version</h4>
                    ${escapeHtml(currentContent).substring(0, 3000)}${currentContent.length > 3000 ? '\n\n... (truncated)' : ''}
                </div>
                <div class="preview-col">
                    <h4>Version from ${dateLabel} (${commitHash.slice(0, 7)})</h4>
                    ${escapeHtml(oldContent).substring(0, 3000)}${oldContent.length > 3000 ? '\n\n... (truncated)' : ''}
                </div>
            </div>
        `;

        body.insertAdjacentHTML('beforeend', paneHtml);
    } catch (error) {
        console.error('Preview version error:', error);
        const loadingEl = document.getElementById('version-preview-loading');
        if (loadingEl) loadingEl.innerHTML = `<p class="text-danger">Failed to load version: ${escapeHtml(error.message)}</p>`;
    }
}

function confirmRestore(commitHash, dateLabel) {
    const { imageId, image } = contentEditorState;
    const body = document.getElementById('version-history-body');

    body.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 12px;">Restore this version?</p>
            <p style="color: var(--text-secondary);">
                This will restore the content from <strong>${dateLabel}</strong> (commit ${commitHash.slice(0, 7)})
                for <strong>${escapeHtml(image?.title || 'this image')}</strong>.
            </p>
            <p style="color: var(--text-secondary); margin-top: 8px; font-size: 0.9rem;">
                The PDF will be regenerated. A new commit will be created (the current version is not lost — it remains in history).
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="showVersionHistory()">Cancel</button>
                <button class="btn btn-primary" onclick="executeRestore('${commitHash}')">Restore Version</button>
            </div>
        </div>
    `;
}

async function executeRestore(commitHash) {
    const { imageId, currentGrade } = contentEditorState;
    const body = document.getElementById('version-history-body');

    body.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div class="spinner spinner-large" style="margin: 0 auto 16px;"></div>
            <p>Restoring content and regenerating PDF...</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">This may take 30-60 seconds.</p>
        </div>
    `;

    try {
        const fn = firebase.functions().httpsCallable('adminRestoreContentVersion');
        const result = await fn({ imageId, gradeLevel: currentGrade, commitHash });

        closeVersionHistoryModal();

        if (result.data.pdfWarning) {
            showToast('Content restored! Warning: PDF regeneration failed.', 'warning', 6000);
        } else {
            showToast('Content restored successfully!', 'success', 5000);
        }

        // Reload the current grade tab to show restored content
        contentEditorState.hasUnsavedChanges = false;
        switchGradeTab(currentGrade);
    } catch (error) {
        console.error('Restore error:', error);
        body.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <p class="text-danger" style="font-size: 1.1rem; margin-bottom: 12px;">Restore Failed</p>
                <p>${escapeHtml(error.message)}</p>
                <div style="margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="showVersionHistory()">Back to History</button>
                </div>
            </div>
        `;
    }
}

function closeVersionHistoryModal() {
    const modal = document.getElementById('version-history-modal');
    if (modal) modal.classList.add('hidden');
}

// ============================================================
// Expose globally
// ============================================================

window.initContentEditor = initContentEditor;
window.switchGradeTab = switchGradeTab;
window.saveContentEdits = saveContentEdits;
window.cancelContentEdit = cancelContentEdit;
window.closeContentEditor = closeContentEditor;
window.showVersionHistory = showVersionHistory;
window.previewVersion = previewVersion;
window.confirmRestore = confirmRestore;
window.executeRestore = executeRestore;
window.closeVersionHistoryModal = closeVersionHistoryModal;
