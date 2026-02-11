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
                <button class="btn btn-small btn-outline" onclick="closeContentEditor()">Close Editor</button>
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
// Expose globally
// ============================================================

window.initContentEditor = initContentEditor;
window.switchGradeTab = switchGradeTab;
window.saveContentEdits = saveContentEdits;
window.cancelContentEdit = cancelContentEdit;
window.closeContentEditor = closeContentEditor;
