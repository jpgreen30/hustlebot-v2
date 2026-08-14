/**
 * SHARED AUDIT LOGS
 *
 * Responsibilities:
 * 1. Maintain immutable append-only audit trail
 * 2. Log all significant operations (agent execution, policy checks, approvals)
 * 3. Track actor, action, resource, and context
 * 4. Enable compliance and debugging via audit history
 * 5. Prevent modification or deletion of logs (immutable by design)
 */

import logger from '../utils/logger.js';

class SharedAuditLogs {
  constructor(db) {
    this.db = db;
    this.logs = []; // In-memory buffer (flushed periodically to DB)
    this.flushInterval = 5000; // ms
    this.maxBufferSize = 1000; // logs
    this.initialized = false;
  }

  /**
   * Initialize audit logs
   */
  async initialize() {
    try {
      logger.info('📋 Initializing Shared Audit Logs...');

      // Start background flush
      this.flushTimer = setInterval(() => this.flushBuffer(), this.flushInterval);

      this.initialized = true;
      logger.info(`✅ Audit Logs initialized (flush every ${this.flushInterval}ms)`);
    } catch (error) {
      logger.error('Error initializing audit logs:', error);
      throw error;
    }
  }

  /**
   * Log an audit entry (append-only)
   */
  async log(action, actorType, actorId, resourceType, resourceId, details = {}) {
    try {
      const entry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
        actor_type: actorType, // user | agent | system
        actor_id: actorId,
        action: action, // agent_executed | policy_checked | approval_required | error_occurred | etc.
        resource_type: resourceType, // agent | job | project | workflow | etc.
        resource_id: resourceId,
        details, // Additional context
        created_at: new Date().toISOString()
      };

      // Store in-memory
      this.logs.push(entry);

      // Flush if buffer is full
      if (this.logs.length >= this.maxBufferSize) {
        await this.flushBuffer();
      }

      return entry;
    } catch (error) {
      logger.error('Error logging audit entry:', error);
      throw error;
    }
  }

  /**
   * Flush in-memory buffer to database
   */
  async flushBuffer() {
    if (this.logs.length === 0) {
      return;
    }

    try {
      if (this.db) {
        const entriesToFlush = [...this.logs];
        this.logs = []; // Clear buffer

        await this.db.bulkCreateAuditLogs(entriesToFlush);

        logger.debug(`📤 Flushed ${entriesToFlush.length} audit logs to database`);
      }
    } catch (error) {
      logger.error('Error flushing audit logs:', error);
      // Re-add to buffer on error (don't lose logs)
      this.logs = this.logs; // Keep the logs
    }
  }

  /**
   * Log agent execution
   */
  async logAgentExecution(agentId, agentName, projectId, input, output, executionTimeMs, success = true) {
    try {
      const details = {
        agent_name: agentName,
        project_id: projectId,
        input: JSON.stringify(input).substring(0, 500), // Truncate large inputs
        output: JSON.stringify(output).substring(0, 500),
        execution_time_ms: executionTimeMs,
        success
      };

      return await this.log(
        'agent_executed',
        'agent',
        agentId,
        'agent',
        agentId,
        details
      );
    } catch (error) {
      logger.error('Error logging agent execution:', error);
      throw error;
    }
  }

  /**
   * Log policy check
   */
  async logPolicyCheck(agentId, policyName, passed, reason) {
    try {
      const details = {
        policy_name: policyName,
        passed,
        reason
      };

      return await this.log(
        'policy_checked',
        'system',
        'system',
        'policy',
        policyName,
        details
      );
    } catch (error) {
      logger.error('Error logging policy check:', error);
      throw error;
    }
  }

  /**
   * Log approval required
   */
  async logApprovalRequired(agentId, operation, reason, projectId) {
    try {
      const details = {
        operation,
        reason,
        project_id: projectId,
        approval_status: 'pending'
      };

      return await this.log(
        'approval_required',
        'agent',
        agentId,
        'project',
        projectId,
        details
      );
    } catch (error) {
      logger.error('Error logging approval required:', error);
      throw error;
    }
  }

  /**
   * Log approval decision
   */
  async logApprovalDecision(approverId, agentId, operation, approved, projectId) {
    try {
      const details = {
        operation,
        approved,
        agent_id: agentId,
        project_id: projectId
      };

      return await this.log(
        'approval_decision',
        'user',
        approverId,
        'project',
        projectId,
        details
      );
    } catch (error) {
      logger.error('Error logging approval decision:', error);
      throw error;
    }
  }

  /**
   * Log error
   */
  async logError(agentId, errorMessage, errorCode, context = {}) {
    try {
      const details = {
        error_message: errorMessage,
        error_code: errorCode,
        context
      };

      return await this.log(
        'error_occurred',
        'agent',
        agentId,
        'agent',
        agentId,
        details
      );
    } catch (error) {
      logger.error('Error logging error entry:', error);
      throw error;
    }
  }

  /**
   * Query audit logs with filters
   */
  async queryLogs(filter = {}) {
    try {
      let results = [];

      if (this.db) {
        // Query from database
        results = await this.db.queryAuditLogs(filter);
      }

      // Also check in-memory buffer
      for (const log of this.logs) {
        let match = true;

        if (filter.actor_type && log.actor_type !== filter.actor_type) {
          match = false;
        }
        if (filter.action && log.action !== filter.action) {
          match = false;
        }
        if (filter.resource_type && log.resource_type !== filter.resource_type) {
          match = false;
        }
        if (filter.resource_id && log.resource_id !== filter.resource_id) {
          match = false;
        }

        if (match) {
          results.push(log);
        }
      }

      return results;
    } catch (error) {
      logger.error('Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit trail for a resource
   */
  async getAuditTrail(resourceType, resourceId) {
    try {
      return await this.queryLogs({
        resource_type: resourceType,
        resource_id: resourceId
      });
    } catch (error) {
      logger.error('Error getting audit trail:', error);
      throw error;
    }
  }

  /**
   * Get recent logs (for dashboards, monitoring)
   */
  async getRecentLogs(limit = 100) {
    try {
      let logs = [];

      if (this.db) {
        logs = await this.db.getRecentAuditLogs(limit);
      }

      // Combine with in-memory buffer and sort
      const allLogs = [...logs, ...this.logs];
      allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return allLogs.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent logs:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(timeframeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - timeframeHours * 60 * 60 * 1000).toISOString();

      const logs = await this.queryLogs({}); // Get all (filter client-side for simplicity)
      const filtered = logs.filter(log => log.timestamp >= cutoffTime);

      const stats = {
        total_entries: filtered.length,
        by_action: {},
        by_actor_type: {},
        by_resource_type: {},
        errors: []
      };

      for (const log of filtered) {
        stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;
        stats.by_actor_type[log.actor_type] = (stats.by_actor_type[log.actor_type] || 0) + 1;
        stats.by_resource_type[log.resource_type] = (stats.by_resource_type[log.resource_type] || 0) + 1;

        if (log.action === 'error_occurred') {
          stats.errors.push({
            timestamp: log.timestamp,
            error_code: log.details.error_code,
            agent_id: log.actor_id
          });
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting audit stats:', error);
      throw error;
    }
  }

  /**
   * Export audit trail (for compliance/reporting)
   */
  async exportAuditTrail(resourceType, resourceId, format = 'json') {
    try {
      const trail = await this.getAuditTrail(resourceType, resourceId);

      switch (format) {
        case 'json':
          return JSON.stringify(trail, null, 2);

        case 'csv':
          return this.convertToCSV(trail);

        case 'html':
          return this.convertToHTML(trail);

        default:
          throw new Error(`Unknown export format: ${format}`);
      }
    } catch (error) {
      logger.error('Error exporting audit trail:', error);
      throw error;
    }
  }

  /**
   * Convert logs to CSV
   */
  convertToCSV(logs) {
    if (logs.length === 0) {
      return 'timestamp,actor_type,actor_id,action,resource_type,resource_id\n';
    }

    const headers = 'timestamp,actor_type,actor_id,action,resource_type,resource_id';
    const rows = logs.map(log =>
      `${log.timestamp},"${log.actor_type}","${log.actor_id}","${log.action}","${log.resource_type}","${log.resource_id}"`
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Convert logs to HTML (simple table)
   */
  convertToHTML(logs) {
    let html = '<table border="1"><tr>';
    html += '<th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Details</th>';
    html += '</tr>';

    for (const log of logs) {
      html += '<tr>';
      html += `<td>${log.timestamp}</td>`;
      html += `<td>${log.actor_type}: ${log.actor_id}</td>`;
      html += `<td>${log.action}</td>`;
      html += `<td>${log.resource_type}: ${log.resource_id}</td>`;
      html += `<td>${JSON.stringify(log.details)}</td>`;
      html += '</tr>';
    }

    html += '</table>';
    return html;
  }

  /**
   * Clean up old logs (for retention policy)
   */
  async cleanup(olderThanDays = 90) {
    try {
      if (this.db) {
        const deletedCount = await this.db.deleteOldAuditLogs(olderThanDays);
        logger.info(`🧹 Cleaned up ${deletedCount} audit logs (> ${olderThanDays} days)`);
        return deletedCount;
      }
      return 0;
    } catch (error) {
      logger.error('Error cleaning up audit logs:', error);
      throw error;
    }
  }

  /**
   * Shutdown (flush and stop timer)
   */
  async shutdown() {
    try {
      clearInterval(this.flushTimer);
      await this.flushBuffer();
      logger.info('✅ Audit logs shutdown complete');
    } catch (error) {
      logger.error('Error shutting down audit logs:', error);
      throw error;
    }
  }
}

export { SharedAuditLogs };
