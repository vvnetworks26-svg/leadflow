/**
 * LocalizationService.ts
 *
 * Manages widget translations per organization.
 * Built-in translations are provided for major languages.
 * Organizations can override any string.
 */

import { WidgetLocalizationModel, IWidgetLocalization, ILocaleStrings, LocaleCode } from '../../models/WidgetLocalization.model';
import { ApiError } from '../../middleware/errorHandler';

// ─── Built-in default strings ─────────────────────────────────────────────────

const DEFAULT_STRINGS: Record<string, ILocaleStrings> = {
  en: {
    welcomeMessage:  'Hi! How can I help you today?',
    placeholder:     'Type a message...',
    sendButton:      'Send',
    typingIndicator: 'is typing...',
    offlineMessage:  "We're offline right now. Leave a message!",
    closeButton:     'Close',
    minimizeButton:  'Minimize',
    poweredBy:       'Powered by LeadFlow',
    bookingButton:   'Book a Meeting',
    errorMessage:    'Something went wrong. Please try again.',
  },
  es: {
    welcomeMessage:  '¡Hola! ¿En qué puedo ayudarte hoy?',
    placeholder:     'Escribe un mensaje...',
    sendButton:      'Enviar',
    typingIndicator: 'está escribiendo...',
    offlineMessage:  'Estamos fuera de línea. ¡Deja un mensaje!',
    closeButton:     'Cerrar',
    minimizeButton:  'Minimizar',
    poweredBy:       'Desarrollado por LeadFlow',
    bookingButton:   'Reservar una reunión',
    errorMessage:    'Algo salió mal. Por favor, inténtalo de nuevo.',
  },
  fr: {
    welcomeMessage:  'Bonjour ! Comment puis-je vous aider ?',
    placeholder:     'Tapez un message...',
    sendButton:      'Envoyer',
    typingIndicator: 'est en train d\'écrire...',
    offlineMessage:  'Nous sommes hors ligne. Laissez un message !',
    closeButton:     'Fermer',
    minimizeButton:  'Réduire',
    poweredBy:       'Propulsé par LeadFlow',
    bookingButton:   'Réserver une réunion',
    errorMessage:    'Une erreur s\'est produite. Veuillez réessayer.',
  },
  de: {
    welcomeMessage:  'Hallo! Wie kann ich Ihnen heute helfen?',
    placeholder:     'Nachricht eingeben...',
    sendButton:      'Senden',
    typingIndicator: 'tippt...',
    offlineMessage:  'Wir sind offline. Hinterlassen Sie eine Nachricht!',
    closeButton:     'Schließen',
    minimizeButton:  'Minimieren',
    poweredBy:       'Powered by LeadFlow',
    bookingButton:   'Meeting buchen',
    errorMessage:    'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
  },
  pt: {
    welcomeMessage:  'Olá! Como posso ajudar você hoje?',
    placeholder:     'Digite uma mensagem...',
    sendButton:      'Enviar',
    typingIndicator: 'está digitando...',
    offlineMessage:  'Estamos offline agora. Deixe uma mensagem!',
    closeButton:     'Fechar',
    minimizeButton:  'Minimizar',
    poweredBy:       'Powered by LeadFlow',
    bookingButton:   'Agendar uma reunião',
    errorMessage:    'Algo deu errado. Por favor, tente novamente.',
  },
  ar: {
    welcomeMessage:  'مرحباً! كيف يمكنني مساعدتك اليوم؟',
    placeholder:     'اكتب رسالة...',
    sendButton:      'إرسال',
    typingIndicator: 'يكتب...',
    offlineMessage:  'نحن غير متصلين الآن. اترك رسالة!',
    closeButton:     'إغلاق',
    minimizeButton:  'تصغير',
    poweredBy:       'مدعوم من LeadFlow',
    bookingButton:   'احجز اجتماعاً',
    errorMessage:    'حدث خطأ ما. حاول مرة أخرى.',
  },
  hi: {
    welcomeMessage:  'नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूँ?',
    placeholder:     'संदेश लिखें...',
    sendButton:      'भेजें',
    typingIndicator: 'टाइप कर रहा है...',
    offlineMessage:  'हम अभी ऑफ़लाइन हैं। संदेश छोड़ें!',
    closeButton:     'बंद करें',
    minimizeButton:  'छोटा करें',
    poweredBy:       'LeadFlow द्वारा संचालित',
    bookingButton:   'मीटिंग बुक करें',
    errorMessage:    'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
  },
};

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export const LocalizationService = {

  async list(organizationId: string): Promise<IWidgetLocalization[]> {
    const docs = await WidgetLocalizationModel.find({ organizationId });
    return docs.map(d => d.toJSON() as unknown as IWidgetLocalization);
  },

  async getOrCreate(organizationId: string, localeCode: LocaleCode): Promise<IWidgetLocalization> {
    const existing = await WidgetLocalizationModel.findOne({ organizationId, localeCode });
    if (existing) return existing.toJSON() as unknown as IWidgetLocalization;

    const defaults = DEFAULT_STRINGS[localeCode] ?? DEFAULT_STRINGS.en;
    const doc = await WidgetLocalizationModel.create({
      organizationId,
      localeCode,
      isRTL:     RTL_LOCALES.has(localeCode),
      strings:   defaults,
      isDefault: localeCode === 'en',
    });
    return doc.toJSON() as unknown as IWidgetLocalization;
  },

  async upsert(organizationId: string, localeCode: LocaleCode, strings: Partial<ILocaleStrings>): Promise<IWidgetLocalization> {
    const defaults = DEFAULT_STRINGS[localeCode] ?? DEFAULT_STRINGS.en;
    const merged   = { ...defaults, ...strings };
    const doc = await WidgetLocalizationModel.findOneAndUpdate(
      { organizationId, localeCode },
      { $set: { strings: merged, isRTL: RTL_LOCALES.has(localeCode), organizationId, localeCode } },
      { upsert: true, new: true }
    );
    return doc!.toJSON() as unknown as IWidgetLocalization;
  },

  async delete(organizationId: string, localeCode: LocaleCode): Promise<void> {
    const doc = await WidgetLocalizationModel.findOneAndDelete({ organizationId, localeCode, isDefault: false });
    if (!doc) throw new ApiError(400, 'Cannot delete default locale or locale not found', 'LOCALE_NOT_FOUND');
  },

  /** Resolve strings for a locale with English fallback for missing keys. */
  async resolve(organizationId: string, localeCode: string): Promise<{ strings: ILocaleStrings; isRTL: boolean }> {
    const doc = await WidgetLocalizationModel.findOne({ organizationId, localeCode }).lean();
    const base = DEFAULT_STRINGS[localeCode] ?? DEFAULT_STRINGS.en;
    const merged = { ...base, ...(doc?.strings ?? {}) } as ILocaleStrings;
    return { strings: merged, isRTL: RTL_LOCALES.has(localeCode) };
  },

  getSupportedLocales(): Array<{ code: string; name: string; isRTL: boolean }> {
    return [
      { code: 'en', name: 'English',    isRTL: false },
      { code: 'es', name: 'Spanish',    isRTL: false },
      { code: 'fr', name: 'French',     isRTL: false },
      { code: 'de', name: 'German',     isRTL: false },
      { code: 'pt', name: 'Portuguese', isRTL: false },
      { code: 'ar', name: 'Arabic',     isRTL: true  },
      { code: 'hi', name: 'Hindi',      isRTL: false },
      { code: 'zh', name: 'Chinese',    isRTL: false },
      { code: 'ja', name: 'Japanese',   isRTL: false },
      { code: 'it', name: 'Italian',    isRTL: false },
    ];
  },
};
