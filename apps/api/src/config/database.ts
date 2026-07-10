/**
 * database.ts
 *
 * MongoDB connection service using Mongoose.
 * Call connect() once at server startup.
 * All models are registered by importing them here so Mongoose
 * registers the schemas before any repository uses them.
 */

import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Register all models by importing them — side-effect imports are intentional
import '../models/Organization.model';
import '../models/Invitation.model';
import '../models/Lead.model';
import '../models/Appointment.model';
import '../models/Conversation.model';
import '../models/Business.model';
import '../models/Notification.model';
import '../models/User.model';
import '../models/Session.model';
import '../models/AuditLog.model';
import '../models/AIConversationSession.model';
import '../models/Pipeline.model';
import '../models/Contact.model';
import '../models/Company.model';
import '../models/Activity.model';
import '../models/Note.model';
import '../models/Task.model';
import '../models/Tag.model';
import '../models/SavedFilter.model';
import '../models/AutomationRule.model';
import '../models/CalendarConnection.model';
import '../models/MeetingType.model';
import '../models/WorkingHours.model';
import '../models/Holiday.model';
import '../models/Booking.model';
import '../models/SchedulingPolicy.model';
import '../models/BookingAnalytics.model';
import '../models/Workflow.model';
import '../models/WorkflowExecution.model';
import '../models/WorkflowTemplate.model';
import '../models/WorkflowWebhook.model';
import '../models/WorkflowFolder.model';
import '../models/WidgetConfiguration.model';
import '../models/WidgetTheme.model';
import '../models/WidgetDeployment.model';
import '../models/WidgetLocalization.model';
import '../models/WidgetAnalytics.model';
import '../models/WidgetABTest.model';
import '../models/WidgetAsset.model';
import '../models/DashboardCache.model';
import '../models/SavedView.model';
import '../models/ConversationThread.model';
import '../models/CommunicationMessage.model';
import '../models/CommunicationAttachment.model';
import '../models/CommunicationTemplate.model';
import '../models/Campaign.model';
import '../models/ChannelAccount.model';
import '../models/InboxRule.model';
import '../models/Agent.model';
import '../models/AgentSession.model';
import '../models/AgentMemory.model';
import '../models/KnowledgeDocument.model';
import '../models/KnowledgeChunk.model';
import '../models/PromptTemplate.model';
import '../models/AgentAnalytics.model';
import '../models/ApiKey.model';
import '../models/PlatformWebhook.model';
import '../models/Integration.model';
import '../models/MarketplaceApp.model';
import '../models/WhiteLabelConfig.model';
import '../models/ImportExportJob.model';
import '../models/SsoConfiguration.model';
import '../models/ComplianceRecord.model';
import '../models/DeveloperApp.model';
import '../models/PlatformAuditLog.model';
import '../ai/analytics';   // registers AIAnalytics model

const CONNECTION_OPTIONS: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB. Resolves when the connection is ready.
 * Rejects with an error if the URI is missing or the connection fails.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) {
    logger.warn('MONGODB_URI is not set — skipping database connection');
    return;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, CONNECTION_OPTIONS);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    throw err;
  }
}

/**
 * Disconnect gracefully. Called during server shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

/** Returns true when Mongoose has an active connection. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
