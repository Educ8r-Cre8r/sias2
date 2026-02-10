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
            return this.data;
        } catch (error) {
            console.error('Metadata load error:', error);
            showToast('Failed to load gallery metadata', 'error');
            return null;
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
    }
};

window.metadataManager = metadataManager;
