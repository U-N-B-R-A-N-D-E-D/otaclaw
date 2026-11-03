/**
 * ThinkingParser - Extracts and summarizes LLM thinking process
 *
 * Converts raw agent events into human-readable thinking summaries
 * for display in the speech bubble. Shows what the LLM is actually doing
 * instead of generic "Thinking" or "Processing".
 *
 * ## Usage
 * ```javascript
 * const parser = new ThinkingParser();
 * const summary = parser.parseEvent(data);
 * // summary = { text: "Analyzing code...", priority: 2 }
 * ```
 */

export class ThinkingParser {
  constructor(config = {}) {
    this.config = config;
    this.maxLength = config.thinkingSummaryMaxLength || 28;
    this.seenTools = new Set();
    this.lastSummary = '';
    this.summaryCount = 0;

    // Context awareness
    this.contextHistory = [];
    this.maxContextHistory = 10;
    this.lastUserIntent = null;
    this.conversationTopic = null;
    this.technicalExplanationCount = 0;
    this.lastContextSwitch = Date.now();
  }

  /**
   * Parse an agent event and return thinking summary
   * @param {Object} data - WebSocket event data
   * @param {Object} context - Optional context about current conversation
   * @returns {Object|null} { text: string, priority: number } or null
   */
  parseEvent(data, context = {}) {
    if (!data) return null;

    // Track context
    this._trackContext(data, context);

    // Check if we should suppress technical details
    if (this._shouldSuppressTechnical(data)) {
      return null;
    }

    // Tool call - highest priority
    if (data.type === 'agent.tool.call' || data.stream === 'tool') {
      const toolName = this._extractToolName(data);
      const message = this._formatToolMessage(toolName);

      // Don't show technical tools for casual conversation
      if (this._isCasualConversation() && this._isTechnicalTool(toolName)) {
        return { text: 'Working...', priority: 2, type: 'tool' };
      }

      return { text: message, priority: 5, type: 'tool' };
    }

    // Tool result
    if (data.type === 'agent.tool.result' || data.phase === 'result') {
      return { text: 'Got results...', priority: 4, type: 'tool-result' };
    }

    // Lifecycle phases
    const phase = data.phase || data.data?.phase;
    if (phase) {
      const phaseSummary = this._parsePhase(phase, data);
      if (phaseSummary && !this._isPhaseRedundant(phaseSummary)) {
        return { ...phaseSummary, type: 'phase' };
      }
    }

    // Stream content analysis
    if (data.stream === 'assistant' || data.type === 'agent.message.delta') {
      return this._parseAssistantStream(data);
    }

    // Message content analysis
    if (data.message || data.delta || data.content) {
      return this._parseMessageContent(data.message || data.delta || data.content);
    }

    return null;
  }

  /**
   * Track conversation context
   */
  _trackContext(data, context) {
    const entry = {
      timestamp: Date.now(),
      type: data.type || data.stream || 'unknown',
      hasContent: !!(data.message || data.delta || data.content),
      userTopic: context.userTopic || this.conversationTopic,
    };

    this.contextHistory.push(entry);
    if (this.contextHistory.length > this.maxContextHistory) {
      this.contextHistory.shift();
    }

    // Detect user intent from context
    if (context.userMessage) {
      this._updateUserIntent(context.userMessage);
    }
  }

  /**
   * Update user intent based on message
   */
  _updateUserIntent(message) {
    const lower = message.toLowerCase();

    // Detect casual vs technical intent
    if (lower.match(/chiste|joke|funny|haha|lol/i)) {
      this.lastUserIntent = 'casual';
      this.conversationTopic = 'humor';
    } else if (lower.match(/code|debug|error|fix|program|function/i)) {
      this.lastUserIntent = 'technical';
      this.conversationTopic = 'coding';
    } else if (lower.match(/help|how|what|why/i)) {
      this.lastUserIntent = 'help';
      this.conversationTopic = 'assistance';
    }

    // Reset technical explanation count on context switch
    if (this._isContextSwitch(message)) {
      this.technicalExplanationCount = 0;
      this.lastContextSwitch = Date.now();
    }
  }

  /**
   * Detect if user changed topic
   */
  _isContextSwitch(message) {
    if (!this.conversationTopic) return false;

    const lower = message.toLowerCase();
    const topicPatterns = {
      'humor': /chiste|joke|funny/,
      'coding': /code|debug|program/,
      'assistance': /help|how|what/,
    };

    // Check if message matches different topic than current
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (topic !== this.conversationTopic && pattern.test(lower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if current conversation is casual
   */
  _isCasualConversation() {
    return this.lastUserIntent === 'casual' ||
           this.conversationTopic === 'humor' ||
           (!this.lastUserIntent && this.contextHistory.length < 3);
  }

  /**
   * Check if tool is too technical for casual conversation
   */
  _isTechnicalTool(toolName) {
    const technicalTools = ['execute_command', 'shell', 'code_interpreter', 'search_files'];
    return technicalTools.includes(toolName?.toLowerCase());
  }

  /**
   * Check if we should suppress technical explanations
   */
  _shouldSuppressTechnical(data) {
    // Don't show technical details for casual conversations
    if (this._isCasualConversation()) {
      const msg = data.message || data.delta || '';

      // Suppress technical explanations
      if (msg.match(/websocket|buffer|render|async|protocol/i)) {
        this.technicalExplanationCount++;
        return this.technicalExplanationCount > 1; // Allow first, suppress repeats
      }
    }

    return false;
  }

  /**
   * Check if phase summary is redundant
   */
  _isPhaseRedundant(phaseSummary) {
    // Don't repeat similar phases
    const recentPhases = this.contextHistory
      .slice(-3)
      .filter(e => e.type === 'phase')
      .map(e => e.text);

    return recentPhases.includes(phaseSummary.text);
  }

  /**
   * Extract tool name from tool call data
   */
  _extractToolName(data) {
    // Try various locations where tool name might be
    const tool = data.tool || data.data?.tool || data.name || data.data?.name;
    if (tool) return tool;

    // Try to extract from message
    const msg = data.message || data.delta || '';
    const match = msg.match(/Using tool[:\s]+(\w+)/i);
    if (match) return match[1];

    // Generic fallback
    return 'tool';
  }

  /**
   * Format tool message based on tool type
   */
  _formatToolName(toolName) {
    if (!toolName) return 'tool';

    // Map common OpenClaw tools to friendly names
    const toolMap = {
      // File operations
      'read_file': 'reading file',
      'write_file': 'writing file',
      'list_files': 'listing files',
      'search_files': 'searching files',
      'glob': 'finding files',
      'file_info': 'checking file',
      'directory_info': 'checking folder',

      // Code operations
      'execute_command': 'running command',
      'shell': 'running command',
      'code_interpreter': 'executing code',
      'analyze_code': 'analyzing code',
      'lint': 'linting code',
      'format': 'formatting code',

      // Web operations
      'browser': 'browsing web',
      'fetch_url': 'fetching URL',
      'web_search': 'searching web',
      'scrape': 'scraping page',

      // Communication
      'send_message': 'sending message',
      'discord_send': 'sending to Discord',
      'telegram_send': 'sending to Telegram',

      // Data operations
      'get_weather': 'checking weather',
      'calculator': 'calculating',
      'math': 'calculating',
      'json_parse': 'parsing data',
      'csv_parse': 'parsing CSV',

      // Git operations
      'git_status': 'checking git',
      'git_diff': 'comparing changes',
      'git_log': 'checking history',

      // Build/Deploy
      'build': 'building',
      'deploy': 'deploying',
      'test': 'testing',
      'lint': 'linting',

      // Claude Code tools
      'Edit': 'editing',
      'Replace': 'replacing',
      'View': 'viewing',
      'Create': 'creating',
      'Insert': 'inserting',
    };

    const normalized = toolName.toLowerCase().replace(/-/g, '_');
    return toolMap[normalized] || toolName;
  }

  /**
   * Format tool message
   */
  _formatToolMessage(toolName) {
    const friendly = this._formatToolName(toolName);

    // Show different message for repeated tools
    if (this.seenTools.has(toolName)) {
      const variations = [
        `Still ${friendly}...`,
        `Continuing ${friendly}...`,
        `${friendly}...`,
      ];
      return variations[this.summaryCount % variations.length];
    }

    this.seenTools.add(toolName);
    return `${friendly.charAt(0).toUpperCase() + friendly.slice(1)}...`;
  }

  /**
   * Parse lifecycle phase
   */
  _parsePhase(phase, _data) {
    const phaseMap = {
      'start': { text: 'Starting...', priority: 1 },
      'planning': { text: 'Planning...', priority: 2 },
      'reasoning': { text: 'Reasoning...', priority: 2 },
      'analyzing': { text: 'Analyzing...', priority: 2 },
      'searching': { text: 'Searching...', priority: 3 },
      'calculating': { text: 'Calculating...', priority: 2 },
      'generating': { text: 'Generating...', priority: 2 },
      'writing': { text: 'Writing...', priority: 2 },
      'coding': { text: 'Coding...', priority: 2 },
      'debugging': { text: 'Debugging...', priority: 3 },
      'testing': { text: 'Testing...', priority: 2 },
      'validating': { text: 'Validating...', priority: 2 },
      'finalizing': { text: 'Finalizing...', priority: 2 },
      'complete': { text: 'Done!', priority: 0 },
      'end': { text: 'Complete', priority: 0 },
      'error': { text: 'Error!', priority: 10 },
    };

    return phaseMap[phase.toLowerCase()] || null;
  }

  /**
   * Parse assistant stream content
   */
  _parseAssistantStream(data) {
    const text = (data.message || data.delta || '');
    const lower = text.toLowerCase();

    // Don't parse content that's part of a response (not thinking)
    if (text.length > 200 && !lower.match(/^(i'm|let me|thinking|analyzing)/)) {
      return null; // Likely actual response content, not thinking
    }

    // Check for thinking indicators
    if (lower.includes('let me think') || lower.includes('thinking...')) {
      return { text: 'Thinking...', priority: 1, type: 'thinking' };
    }

    if (lower.includes('analyzing') || lower.includes('looking at')) {
      return { text: 'Analyzing...', priority: 2, type: 'thinking' };
    }

    if (lower.includes('searching') || lower.includes('finding')) {
      return { text: 'Searching...', priority: 3, type: 'thinking' };
    }

    if (lower.includes('checking') || lower.includes('verifying')) {
      return { text: 'Checking...', priority: 2, type: 'thinking' };
    }

    if (lower.includes('reading') || lower.includes('loading')) {
      return { text: 'Reading...', priority: 2, type: 'thinking' };
    }

    // Default for assistant stream
    return { text: 'Processing...', priority: 1, type: 'processing' };
  }

  /**
   * Parse message content for thinking indicators
   */
  _parseMessageContent(content) {
    if (!content) return null;

    const lower = content.toLowerCase();
    const length = content.length;

    // First 100 chars - likely planning/thinking
    if (length < 100) {
      if (lower.includes('step') || lower.includes('first') || lower.includes('plan')) {
        return { text: 'Planning...', priority: 2, type: 'thinking' };
      }
      if (lower.includes('error') || lower.includes('fix') || lower.includes('bug')) {
        return { text: 'Debugging...', priority: 3, type: 'thinking' };
      }
    }

    // Code indicators
    if (lower.includes('```') || lower.includes('function') || lower.includes('class')) {
      return { text: 'Coding...', priority: 2, type: 'thinking' };
    }

    // Analysis indicators
    if (lower.includes('because') || lower.includes('therefore') || lower.includes('however')) {
      return { text: 'Analyzing...', priority: 2, type: 'thinking' };
    }

    return null;
  }

  /**
   * Get current thinking summary based on accumulated context
   */
  getCurrentSummary() {
    return this.lastSummary;
  }

  /**
   * Reset parser state (call at start of new message)
   * Preserves context history for continuity
   */
  reset() {
    this.seenTools.clear();
    this.lastSummary = '';
    this.summaryCount = 0;
    this.technicalExplanationCount = 0;
    // Note: contextHistory, lastUserIntent, conversationTopic are preserved
    // for continuity between messages in the same session
  }

  /**
   * Full reset for new conversation session
   */
  resetFull() {
    this.reset();
    this.contextHistory = [];
    this.lastUserIntent = null;
    this.conversationTopic = null;
    this.lastContextSwitch = Date.now();
  }

  /**
   * Update last summary (call when showing a summary)
   */
  updateLastSummary(text) {
    this.lastSummary = text;
    this.summaryCount++;
  }

  /**
   * Format summary for display (truncate if needed)
   */
  formatForDisplay(text) {
    if (!text) return '';
    if (text.length <= this.maxLength) return text;
    return text.substring(0, this.maxLength - 1) + '…';
  }
}

/**
 * Create singleton instance
 */
export const thinkingParser = new ThinkingParser();

export default ThinkingParser;
