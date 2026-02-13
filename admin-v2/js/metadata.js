/**
 * SIAS Admin Dashboard — Metadata Manager
 * Fetches and caches gallery-metadata.json.
 */

const metadataManager = {
    data: null,
    lastFetch: 0,
    cacheDuration: 5 * 60 * 1000, // 5 minutes

    async load(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this.data && (now - this.lastFetch) < this.cacheDuration) {
            return this.data;
        }

        try {
            const response = await fetch('../gallery-metadata.json?t=' + now);
            if (!response.ok) throw new Error('Failed to fetch metadata: ' + response.status);
            this.data = await response.json();
            this.lastFetch = now;

            // Merge real-time processing costs from Firestore
            // (metadata JSON on Hosting may lag behind due to git→deploy pipeline)
            await this._mergeFirestoreCosts();

            return this.data;
        } catch (error) {
            console.error('Metadata load error:', error);
            showToast('Failed to load gallery metadata', 'error');
            return null;
        }
    },

    /**
     * Merge Firestore processingCosts into metadata images.
     * Firestore is the source of truth for cost (updated instantly by Cloud Functions).
     */
    async _mergeFirestoreCosts() {
        if (!this.data || !this.data.images) return;
        try {
            const snapshot = await db.collection('processingCosts').get();
            if (snapshot.empty) return;

            const costMap = {};
            snapshot.forEach(doc => {
                costMap[doc.id] = doc.data(); // doc.id = filename
            });

            for (const image of this.data.images) {
                const fsData = costMap[image.filename];
                if (fsData && fsData.cost !== undefined) {
                    image.processingCost = fsData.cost;
                    // Also merge processingTime if available and more recent
                    if (fsData.processingTime) image.processingTime = fsData.processingTime;
                }
            }
        } catch (err) {
            console.warn('Could not merge Firestore costs:', err.message);
            // Non-fatal — fall back to metadata JSON values
        }
    },

    getData() {
        return this.data;
    },

    getImages() {
        return this.data ? this.data.images : [];
    },

    getImageById(id) {
        if (!this.data) return null;
        return this.data.images.find(img => img.id === id);
    },

    getImagesByCategory(category) {
        if (!this.data) return [];
        return this.data.images.filter(img => img.category === category);
    },

    getImagesWithCostData() {
        if (!this.data) return [];
        return this.data.images.filter(img =>
            img.processingCost !== undefined && img.processingCost !== null
        );
    },

    /**
     * Remove an image from the local cache (optimistic update after delete)
     */
    removeImageLocally(imageId) {
        if (!this.data) return;
        this.data.images = this.data.images.filter(img => img.id !== imageId);
        this.data.totalImages = this.data.images.length;
    },

    /**
     * Update an image's fields in the local cache (optimistic update after edit)
     */
    updateImageLocally(imageId, updates) {
        if (!this.data) return;
        const img = this.data.images.find(i => i.id === imageId);
        if (img) {
            Object.assign(img, updates);
        }
    }
};

window.metadataManager = metadataManager;
