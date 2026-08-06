import React from 'react';
import { ChatWidget } from './components/Chat/ChatWidget';

/**
 * Widget application root.
 * Renders only the floating chat widget — no routing, no auth.
 * This app is embedded as a <script> tag on any website via the widget SDK.
 */
export default function App() {
  return <ChatWidget />;
}
