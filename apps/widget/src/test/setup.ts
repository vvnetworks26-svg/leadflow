import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrollIntoView — ChatWindow calls it on new
// messages. Standard no-op polyfill for RTL + jsdom.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

