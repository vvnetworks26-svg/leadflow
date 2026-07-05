/**
 * conversation/types.ts — All Conversation Shell types. Pure contracts.
 */

// ─── Shell state ──────────────────────────────────────────────────────────────

export type ConversationState =
  | 'closed'
  | 'opening'
  | 'open'
  | 'closing'
  | 'minimized'
  | 'disabled';

export interface ConversationStatus {
  state:      ConversationState;
  visible:    boolean;
  minimized:  boolean;
  fullscreen: boolean;
  messageCount: number;
  inputLength:  number;
}

// ─── Window mode ─────────────────────────────────────────────────────────────

export type WindowMode = 'floating' | 'fullscreen' | 'adaptive';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputOptions {
  placeholder?:  string;
  maxLength?:    number;
  multiline?:    boolean;
  disabled?:     boolean;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface ConversationDiagnostics {
  conversationVisible: boolean;
  conversationState:   ConversationState;
  inputLength:         number;
  messageCount:        number;
  minimized:           boolean;
  fullscreen:          boolean;
}

// ─── Controller ──────────────────────────────────────────────────────────────

export interface IConversationController {
  open():     void;
  close():    void;
  minimize(): void;
  restore():  void;
  toggle():   void;
  isOpen():   boolean;
  isMinimized(): boolean;
  getState(): ConversationState;
  getStatus(): ConversationStatus;
  appendMessage(html: string): void;
  clearMessages(): void;
  scrollToBottom(): void;
  setInputPlaceholder(text: string): void;
  setInputDisabled(disabled: boolean): void;
  getInputValue(): string;
  clearInput(): void;
  getDiagnostics(): ConversationDiagnostics;
  destroy(): void;
}
