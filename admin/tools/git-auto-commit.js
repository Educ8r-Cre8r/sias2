// ===================================
// Git Auto-Commit & Push
// Handles git operations automatically
// ===================================

const simpleGit = require('simple-git');
const path = require('path');
const chalk = require('chalk');

class GitAutoCommit {
    constructor(repoPath) {
        this.git = simpleGit(repoPath);
        this.repoPath = repoPath;
    }

    /**
     * Check if directory is a git repository
     * @returns {Promise<boolean>}
     */
    async isGitRepo() {
        try {
            await this.git.status();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current git status
     * @returns {Promise<Object>}
     */
    async getStatus() {
        try {
            const status = await this.git.status();
            return {
                success: true,
                status,
                hasChanges: status.files.length > 0,
                branch: status.current,
                ahead: status.ahead,
                behind: status.behind
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stage files for commit
     * @param {Array<string>} files - Files to stage (or ['.'] for all)
     * @returns {Promise<Object>}
     */
    async stageFiles(files = ['.']) {
        try {
            await this.git.add(files);
            return {
                success: true,
                stagedFiles: files
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create a commit
     * @param {string} message - Commit message
     * @returns {Promise<Object>}
     */
    async commit(message) {
        try {
            const result = await this.git.commit(message);
            return {
                success: true,
                commit: result.commit,
                summary: result.summary,
                message
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Push commits to remote
     * @param {string} remote - Remote name (default: 'origin')
     * @param {string} branch - Branch name (default: current branch)
     * @returns {Promise<Object>}
     */
    async push(remote = 'origin', branch = null) {
        try {
            // Get current branch if not specified
            if (!branch) {
                const status = await this.git.status();
                branch = status.current;
            }

            await this.git.push(remote, branch);

            return {
                success: true,
                remote,
                branch,
                message: `Successfully pushed to ${remote}/${branch}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                remote,
                branch
            };
        }
    }

    /**
     * Pull latest changes from remote
     * @param {string} remote - Remote name (default: 'origin')
     * @param {string} branch - Branch name (default: current branch)
     * @returns {Promise<Object>}
     */
    async pull(remote = 'origin', branch = null) {
        try {
            if (!branch) {
                const status = await this.git.status();
                branch = status.current;
            }

            const result = await this.git.pull(remote, branch);

            return {
                success: true,
                result,
                message: `Successfully pulled from ${remote}/${branch}`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Complete workflow: stage, commit, and push
     * @param {Object} options - Options for the workflow
     * @returns {Promise<Object>}
     */
    async autoCommitAndPush(options = {}) {
        const {
            files = ['.'],
            message = 'Update via admin interface',
            remote = 'origin',
            branch = null,
            pullFirst = true
        } = options;

        const results = {
            pull: null,
            stage: null,
            commit: null,
            push: null
        };

        try {
            // Check if it's a git repo
            const isRepo = await this.isGitRepo();
            if (!isRepo) {
                return {
                    success: false,
                    error: 'Not a git repository',
                    results
                };
            }

            // Pull latest changes first (optional)
            if (pullFirst) {
                console.log(chalk.blue('📥 Pulling latest changes...'));
                results.pull = await this.pull(remote, branch);
                if (results.pull.success) {
                    console.log(chalk.green('✓ Pull successful'));
                } else {
                    console.log(chalk.yellow('⚠ Pull failed (continuing anyway)'));
                }
            }

            // Check status
            const statusResult = await this.getStatus();
            if (!statusResult.hasChanges) {
                return {
                    success: true,
                    message: 'No changes to commit',
                    results
                };
            }

            // Stage files
            console.log(chalk.blue('📋 Staging files...'));
            results.stage = await this.stageFiles(files);
            if (!results.stage.success) {
                throw new Error(`Failed to stage files: ${results.stage.error}`);
            }
            console.log(chalk.green('✓ Files staged'));

            // Commit
            console.log(chalk.blue('💾 Creating commit...'));
            results.commit = await this.commit(message);
            if (!results.commit.success) {
                throw new Error(`Failed to commit: ${results.commit.error}`);
            }
            console.log(chalk.green(`✓ Commit created: ${results.commit.commit}`));

            // Push
            console.log(chalk.blue('🚀 Pushing to GitHub...'));
            results.push = await this.push(remote, branch);
            if (!results.push.success) {
                throw new Error(`Failed to push: ${results.push.error}`);
            }
            console.log(chalk.green(`✓ Pushed to ${results.push.remote}/${results.push.branch}`));

            return {
                success: true,
                message: 'Successfully committed and pushed changes',
                results
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                results
            };
        }
    }

    /**
     * Generate commit message for photo uploads
     * @param {number} count - Number of photos
     * @param {Object} categoryCounts - Counts by category
     * @returns {string}
     */
    static generateCommitMessage(count, categoryCounts = {}) {
        let message = `Add ${count} new image${count > 1 ? 's' : ''} via admin interface`;

        const categories = Object.entries(categoryCounts)
            .filter(([_, count]) => count > 0)
            .map(([category, count]) => `${count} ${category.replace('-', ' ')}`)
            .join(', ');

        if (categories) {
            message += `\n\n${categories}`;
        }

        message += '\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>';

        return message;
    }

    /**
     * Get git log
     * @param {number} count - Number of commits to retrieve
     * @returns {Promise<Object>}
     */
    async getLog(count = 10) {
        try {
            const log = await this.git.log({ maxCount: count });
            return {
                success: true,
                commits: log.all
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = GitAutoCommit;

// If run directly (for testing)
if (require.main === module) {
    const repoPath = path.join(__dirname, '../..');

    const git = new GitAutoCommit(repoPath);

    (async () => {
        console.log(chalk.cyan('=== Git Auto-Commit Test ===\n'));

        const status = await git.getStatus();
        console.log('Status:', status);

        if (status.hasChanges) {
            const result = await git.autoCommitAndPush({
                message: 'Test commit from git-auto-commit.js'
            });
            console.log('\nResult:', result);
        } else {
            console.log(chalk.yellow('No changes to commit'));
        }
    })();
}
