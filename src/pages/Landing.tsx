import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bot, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Flame, 
  MessageSquare, 
  PhoneCall, 
  Play, 
  Plus, 
  Send, 
  Settings, 
  ShieldCheck, 
  Sparkles, 
  TrendingUp, 
  UserCheck, 
  Users, 
  X,
  ChevronDown,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { widgetApiClient } from '../services/api/widgetApiClient';
import { useUser } from '../context/AuthContext';

export default function Landing() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  
  // States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatStep, setChatStep] = useState(0); // 0: Name, 1: Need, 2: Phone/Email, 3: Success
  const [leadName, setLeadName] = useState('');
  const [leadNeed, setLeadNeed] = useState('AC Repair');
  const [leadContact, setLeadContact] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'ai' | 'user', text: string }>>([
    { sender: 'ai', text: "Hey! I'm LeadFlow's automated booking assistant. I schedule emergency service and estimates 24/7. What's your name?" }
  ]);
  const [userInput, setUserInput] = useState('');
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  
  // Contact Form State
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', address: '', hvacNeed: 'AC Repair', message: '' });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  // Chat message scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Handle chat widget submissions
  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userText = userInput;
    setUserInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);

    await new Promise(resolve => setTimeout(resolve, 600));

    if (chatStep === 0) {
      setLeadName(userText);
      setChatStep(1);
      setChatMessages(prev => [
        ...prev,
        { sender: 'ai', text: `Nice to meet you, ${userText}! What service does your HVAC system need? (e.g., AC Repair, Heating Tune-up, Duct Cleaning, System Replacement Quote)` }
      ]);
    } else if (chatStep === 1) {
      setLeadNeed(userText);
      setChatStep(2);
      setChatMessages(prev => [
        ...prev,
        { sender: 'ai', text: `Got it, ${userText}. Lastly, please enter your Phone Number and Email so we can confirm your technician's arrival.` }
      ]);
    } else if (chatStep === 2) {
      setLeadContact(userText);
      setChatStep(3);
      
      // Call the public widget booking endpoint — no JWT required.
      try {
        const phone = userText.match(/\d+/g)?.join('') || '5553021829';
        const formattedPhone = phone.length >= 10
          ? `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6,10)}`
          : userText;

        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const isReplacement = leadNeed.toLowerCase().includes('replace') || leadNeed.toLowerCase().includes('quote');

        await widgetApiClient.book({
          customerName:  leadName,
          phone:         formattedPhone,
          email:         leadName.toLowerCase().replace(/\s+/g, '') + '@gmail.com',
          address:       '742 Evergreen Terrace, Atlanta, GA',
          service:       leadNeed,
          emergency:     false,
          date:          tomorrow,
          time:          '13:00',
          displayDate:   'Tomorrow',
          displayTime:   '1:00 PM',
          duration:      90,
          status:        'New',
          priority:      'High',
          value:         isReplacement ? 7800 : 350,
          notes:         `Lead captured via live AI landing page chat assistant. Customer reported need: "${leadNeed}".`,
        });
      } catch (err) {
        console.error('[Landing] widgetApiClient.book failed:', err);
      }

      setChatMessages(prev => [
        ...prev,
        { sender: 'ai', text: `Excellent! I have captured your ticket and successfully scheduled your appointment for tomorrow at 1:00 PM. A certified technician will call you shortly. Log in as an HVAC owner to see this lead populate instantly on the dashboard!` }
      ]);
    }
  };

  // Handle traditional Contact Form Submission
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Use the public widget endpoint — no JWT required.
      await widgetApiClient.createLead({
        name:     contactForm.name,
        phone:    contactForm.phone,
        email:    contactForm.email,
        address:  contactForm.address,
        hvacNeed: contactForm.hvacNeed,
        status:   'New',
        priority: 'Medium',
        value:    1200,
        source:   'Contact Form',
        notes:    `Contact Form Submission: "${contactForm.message}"`,
      });
      setContactSubmitted(true);
    } catch (err) {
      console.error('[Landing] contact form submit failed:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 selection:bg-indigo-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 p-2 rounded-lg text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-slate-900">Lead<span className="text-indigo-600">Flow</span></span>
          </div>

          {/* Nav Items */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">Features</a>
            <a href="#benefits" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">Benefits</a>
            <a href="#how-it-works" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">How It Works</a>
            <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">Pricing</a>
            <a href="#faq" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">FAQ</a>
            <a href="#contact" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition">Contact</a>
          </div>

          <div className="flex items-center space-x-4">
            {isSignedIn ? (
              <Link to="/dashboard" className="inline-flex items-center space-x-1 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
                <span>Go to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/sign-in" className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 transition">Sign In</Link>
                <Link to="/sign-up" className="bg-slate-950 hover:bg-slate-900 text-white text-sm font-semibold px-4.5 py-2.5 rounded-lg transition shadow-md hover:shadow-lg hover:shadow-slate-100">
                  Try Free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-8 animate-slide-up">
            <div className="inline-flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Lead Capture for HVAC Contractor Growth</span>
            </div>
            
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl text-slate-900 tracking-tight leading-[1.1]">
              Never Miss Another <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-400">Midnight AC Repair Call</span>
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed max-w-xl font-medium">
              LeadFlow automatically captures warm HVAC leads, answers system questions, and books dispatch-ready appointments 24/7. Built specifically for residential air, heating, and plumbing contractors.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <Link to="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-lg text-center shadow-lg shadow-indigo-100 hover:shadow-xl transition animate-pulse-slow">
                Start 14-Day Free Trial
              </Link>
              <button 
                onClick={() => setIsChatOpen(true)}
                className="inline-flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-6 py-4 rounded-lg transition shadow-sm"
              >
                <Play className="h-4 w-4 fill-current text-indigo-500" />
                <span>Test Live Chat Widget</span>
              </button>
            </div>

            {/* Trust Metrics */}
            <div className="pt-6 border-t border-slate-200 grid grid-cols-3 gap-6">
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">41%</p>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Lead Capture Increase</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">24/7/365</p>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">No Sleep Triage</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-slate-900">ServiceTitan</p>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Ready Integrations</p>
              </div>
            </div>
          </div>

          {/* Interactive visual device mockup */}
          <div className="lg:col-span-5 relative">
            <div className="absolute -inset-4 bg-indigo-200 rounded-3xl blur-3xl opacity-30 -z-10 animate-pulse-slow"></div>
            
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">DISPATCH ALIGNMENT ACTIVE</span>
                </div>
                <Sparkles className="h-4 w-4 text-indigo-500 animate-spin-slow" />
              </div>

              {/* Chat flow demonstration */}
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">LeadFlow Bot</span>
                  <p className="text-sm text-slate-700 font-semibold leading-relaxed">Hello, I see your furnace is blowing cold air. I can schedule a senior diagnostic technician to visit tomorrow at 9:00 AM or 1:00 PM. Which works best?</p>
                </div>

                <div className="bg-indigo-600 p-4 rounded-lg text-white space-y-1 max-w-[85%] ml-auto shadow-md shadow-indigo-100">
                  <span className="text-[10px] font-bold text-indigo-100 uppercase tracking-wider">Homeowner (Sarah)</span>
                  <p className="text-sm font-semibold leading-relaxed">Tomorrow 9:00 AM is perfect. AC went out last night, it is baking inside!</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Automated Dispatch</span>
                  <p className="text-sm text-slate-800 font-bold flex items-center space-x-1.5 leading-relaxed">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Booking scheduled for Monday, June 29 at 9:00 AM. Ticket sent to ServiceTitan.</span>
                  </p>
                </div>
              </div>

              {/* Mock stat */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-150">
                <div className="bg-slate-50 p-3 rounded-lg text-center">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Lead Source</span>
                  <span className="font-bold text-sm text-slate-800 block mt-0.5">HVAC Web Widget</span>
                </div>
                <div className="bg-emerald-50/50 p-3 rounded-lg text-center">
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider block">Est. Revenue</span>
                  <span className="font-bold text-sm text-emerald-700 block mt-0.5">$350 - $6,500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="py-24 bg-white border-t border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto space-y-16 animate-fade-in">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Platform Capabilities</h2>
            <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              Engineered Exclusively for Residential and Commercial Service Contractors
            </p>
            <p className="text-slate-500 font-medium text-md">
              Most live chats require manual staff monitoring. LeadFlow uses trained HVAC intelligence to extract model numbers, diagnose symptoms, check calendar slots, and log jobs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">HVAC Trained Conversation</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Trained specifically on air handlers, ductwork, compressors, furnace systems, SEER efficiency levels, heat pumps, and common fault codes.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <Calendar className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">Intelligent Dispatch Sync</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Reads real-time technicians availability windows. Books actual slots directly into your booking queue, preventing double booking.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <PhoneCall className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">Instant SMS & Web Capture</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Captures leads from any desktop or mobile website widget, and forwards alerts immediately to phone lines via smart SMS integrations.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">Deal Value Priority Triage</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Recognizes high-revenue jobs like "system replacement" and alerts project managers instantly, putting maintenance requests on secondary triage.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">Address & Map Validation</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Cleanses and verifies lead addresses, matching them directly to your designated dispatch service radiuses before scheduling technicians.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-50 hover:bg-slate-100/70 transition duration-200 border border-slate-150 p-8 rounded-xl space-y-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 w-fit">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="font-display font-extrabold text-lg text-slate-900">Centralized Live Dashboard</h3>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                A gorgeous unified dashboard for dispatcher oversight. Override automated AI conversations at any moment to take control of customer chat lines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Before & After Comparison */}
      <section id="benefits" className="py-24 bg-slate-50 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Why LeadFlow?</h2>
            <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              Transform Your HVAC Front Office Operations
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Before */}
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 shadow-sm">
              <h3 className="font-display font-bold text-xl text-red-600 flex items-center space-x-2">
                <X className="h-5 w-5" />
                <span>The Traditional Front Office</span>
              </h3>
              
              <ul className="space-y-4 text-slate-600 text-sm">
                <li className="flex items-start space-x-3">
                  <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                    <X className="h-3 w-3" />
                  </div>
                  <span className="font-medium"><strong>Missed Calls:</strong> 62% of homeowners hang up and call a competitor if their call goes to voicemail after hours.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                    <X className="h-3 w-3" />
                  </div>
                  <span className="font-medium"><strong>Slow Booking:</strong> Customers submitting web forms wait an average of 4.2 hours for a callback, by which time they have booked elsewhere.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-red-50 p-1 rounded text-red-600 mt-0.5">
                    <X className="h-3 w-3" />
                  </div>
                  <span className="font-medium"><strong>Wasted Dispatch Trips:</strong> Dispatchers send techs to "emergency calls" only to find out they just need batteries in a thermostat.</span>
                </li>
              </ul>
            </div>

            {/* After */}
            <div className="bg-slate-950 text-white rounded-xl p-8 space-y-6 shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-indigo-600 h-48 w-48 rounded-full blur-2xl opacity-40"></div>
              
              <h3 className="font-display font-bold text-xl text-indigo-400 flex items-center space-x-2 relative z-10">
                <CheckCircle className="h-5 w-5 text-indigo-500" />
                <span>LeadFlow AI Office Assistant</span>
              </h3>

              <ul className="space-y-4 text-slate-200 text-sm relative z-10">
                <li className="flex items-start space-x-3">
                  <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                    <CheckCircle className="h-3 w-3" />
                  </div>
                  <span className="font-semibold"><strong>Immediate Response:</strong> 100% of website visits and text messages answered within 8 seconds, 24 hours a day.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                    <CheckCircle className="h-3 w-3" />
                  </div>
                  <span className="font-semibold"><strong>Frictionless Schedulers:</strong> Automatically confirms location eligibility, identifies equipment needs, and assigns calendar blocks.</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="bg-indigo-900 p-1 rounded text-indigo-300 mt-0.5">
                    <CheckCircle className="h-3 w-3" />
                  </div>
                  <span className="font-semibold"><strong>Intelligent Qualification:</strong> Validates address service zones and pre-diagnoses problems (clogged drains, worn contactors) before techs roll out.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-white border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Simplifying HVAC</h2>
            <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              From Visitor to Booked Job in 4 Simple Steps
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">01</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Embed Widget</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                Add our snippet to your website with one click. Completely custom branded to match your logo and colors.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">02</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">AI Triages Customer</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                Our bot chats with visitors, analyzes symptoms, qualifies their address, and calculates initial estimate metrics.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">03</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Auto-Book Appointment</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                The bot presents available dispatch blocks from your calendar and locks in the appointment for the customer.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-4 relative">
              <div className="text-5xl font-extrabold text-indigo-100/60 font-display">04</div>
              <h4 className="font-display font-extrabold text-lg text-slate-950">Dispatched!</h4>
              <p className="text-sm text-slate-500 leading-relaxed font-semibold">
                The lead info, customer profile, and appointment details are logged securely, syncing straight to your dispatcher screen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-slate-50 border-b border-slate-100 px-6">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Pricing</h2>
            <p className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              Flexible Plans Built for Growing Shops
            </p>
            <p className="text-slate-500 font-semibold">Every plan includes a 14-day free trial. No credit card required.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Tier 1 */}
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <span className="font-semibold text-xs text-slate-400 uppercase tracking-wider">Starter</span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-4xl font-bold font-display text-slate-900">$149</span>
                  <span className="text-slate-400 text-sm font-medium">/month</span>
                </div>
                <p className="text-xs text-slate-500 font-semibold">Ideal for family-owned HVAC businesses with 1-3 service trucks.</p>
                <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Up to 100 AI chats / month</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Dynamic Web Widget</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Google Calendar Sync</span>
                  </div>
                </div>
              </div>
              <Link to="/sign-up" className="block text-center text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-3 rounded-lg transition mt-6">
                Start Trial
              </Link>
            </div>

            {/* Tier 2 */}
            <div className="bg-white border border-indigo-500 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-md relative ring-2 ring-indigo-600/10">
              <div className="absolute top-0 right-6 -translate-y-1/2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                Most Popular
              </div>
              <div className="space-y-4">
                <span className="font-semibold text-xs text-indigo-600 uppercase tracking-wider">Professional</span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-4xl font-bold font-display text-slate-900">$299</span>
                  <span className="text-slate-400 text-sm font-medium">/month</span>
                </div>
                <p className="text-xs text-slate-500 font-semibold">Built for expanding HVAC businesses running 4–15 dispatch vehicles.</p>
                <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-bold text-slate-900">Unlimited AI chats</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">ServiceTitan / Housecall Pro Sync</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Smart SMS Phone Number Sync</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Priority replacement quote alerts</span>
                  </div>
                </div>
              </div>
              <Link to="/sign-up" className="block text-center text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-3 rounded-lg transition shadow-md shadow-indigo-100 mt-6">
                Start Trial
              </Link>
            </div>

            {/* Tier 3 */}
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <span className="font-semibold text-xs text-slate-400 uppercase tracking-wider">Enterprise</span>
                <div className="flex items-baseline space-x-1">
                  <span className="text-4xl font-bold font-display text-slate-900">$599</span>
                  <span className="text-slate-400 text-sm font-medium">/month</span>
                </div>
                <p className="text-xs text-slate-500 font-semibold">Engineered for large multi-location operations with 15+ service trucks.</p>
                <div className="border-t border-slate-100 my-4 pt-4 space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Multi-location routing</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Custom LLM voice synthesis</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <CheckCircle className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">Dedicated Enterprise support rep</span>
                  </div>
                </div>
              </div>
              <Link to="/sign-up" className="block text-center text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 py-3 rounded-lg transition mt-6">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 bg-white border-b border-slate-100 px-6">
        <div className="max-w-4xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">FAQ</h2>
            <p className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-tight">
              Frequently Asked Questions
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "Will LeadFlow integrate with ServiceTitan or Housecall Pro?",
                a: "Yes! LeadFlow supports full API integrations with ServiceTitan, Housecall Pro, and Jobber. When a lead schedules an appointment, a customer record and booking request is pushed automatically into your existing dispatcher workspace."
              },
              {
                q: "How does the AI know how to diagnose residential HVAC symptoms?",
                a: "Our models have been extensively trained on common home systems (including gas and electric furnaces, ducted heat pumps, mini-splits, and packaged AC systems). It can identify symptoms of refrigerant leaks, failing compressors, thermostat faults, or seasonal tune-up requests."
              },
              {
                q: "Can we manually override the AI when a high-value lead is chatting?",
                a: "Absolutely. The dispatcher view features a live conversational inbox. If you see a major HVAC replacement quote chatting, your staff can click one button to pause the automated AI assistant and take over the keyboard live."
              },
              {
                q: "Is it secure? Where is customer data stored?",
                a: "Data security is our top priority. All conversations, address entries, and phone contacts are encrypted and securely stored. We comply fully with SOC2 standards and respect homeowner privacy."
              }
            ].map((item, index) => (
              <div key={index} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                <button
                  onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-950 hover:bg-slate-50 transition"
                >
                  <span>{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${faqOpen === index ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {faqOpen === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-slate-200 bg-white"
                    >
                      <p className="p-5 text-sm text-slate-600 leading-relaxed font-semibold">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Traditional Contact Form Section */}
      <section id="contact" className="py-24 bg-slate-50 px-6">
        <div className="max-w-3xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="font-display font-bold text-xs text-indigo-600 uppercase tracking-widest">Contact</h2>
            <p className="font-display font-extrabold text-3xl text-slate-900 tracking-tight leading-tight">
              Talk to Our Enterprise Team
            </p>
            <p className="text-slate-500 font-semibold">Need a custom demo or have custom dispatch requirements? We would love to chat.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            {contactSubmitted ? (
              <div className="text-center py-8 space-y-4 animate-fade-in">
                <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="font-display font-extrabold text-xl text-slate-900">Message Received!</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">Thank you. We have logged your request in our database. You can log into the dashboard to inspect this lead entry immediately.</p>
                <Link to="/sign-in" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition shadow-sm">
                  Sign In to Dashboard
                </Link>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Name</label>
                    <input 
                      type="text" 
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="David Sterling" 
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Email</label>
                    <input 
                      type="email" 
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="david@sterlinghvac.com" 
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
                    <input 
                      type="tel" 
                      required
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="(555) 000-0000" 
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Services Needed</label>
                    <select 
                      value={contactForm.hvacNeed}
                      onChange={(e) => setContactForm({ ...contactForm, hvacNeed: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-bold transition"
                    >
                      <option value="AC Repair">AC Repair & Troubleshooting</option>
                      <option value="Heat Pump Install">Heat Pump Installation</option>
                      <option value="Maintenance">Annual Maintenance Tune-up</option>
                      <option value="System Replacement Quote">Full System Replacement Quote</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Office Address</label>
                  <input 
                    type="text" 
                    required
                    value={contactForm.address}
                    onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                    placeholder="123 HVAC Highway, Suite A" 
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold transition" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Message</label>
                  <textarea 
                    rows={4}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    placeholder="Tell us about your fleet, CRM, and target volume..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 text-sm outline-none font-semibold resize-none transition"
                  ></textarea>
                </div>

                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-lg transition shadow-md shadow-indigo-100">
                  Submit Request & View Seed Database
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Floating Interactive Chatbot Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isChatOpen ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-white border border-slate-200 rounded-xl shadow-2xl w-[360px] h-[500px] flex flex-col justify-between overflow-hidden"
            >
              {/* Header */}
              <div className="bg-slate-950 text-white p-4 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="bg-white/10 p-1.5 rounded-lg">
                    <Bot className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm">LeadFlow Booking Bot</h5>
                    <span className="text-[10px] text-slate-300 flex items-center space-x-1 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 block animate-pulse"></span>
                      <span>Answers 24/7 HVAC</span>
                    </span>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/10 p-1.5 rounded-lg transition text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {chatMessages.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`p-3.5 rounded-xl text-sm leading-relaxed max-w-[85%] font-semibold ${
                      msg.sender === 'ai' 
                        ? 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-sm' 
                        : 'bg-indigo-600 text-white ml-auto rounded-tr-none shadow-md shadow-indigo-100'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Form */}
              {chatStep <= 2 ? (
                <form onSubmit={handleChatSend} className="p-3 border-t border-slate-150 flex items-center space-x-2 bg-white">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder={
                      chatStep === 0 ? "What is your name?" :
                      chatStep === 1 ? "AC replacement, furnace fix..." :
                      "Phone number and email..."
                    }
                    className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 text-sm outline-none font-semibold transition"
                  />
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-lg transition shadow-sm">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-t border-emerald-100">
                  🎉 Lead synced to owner dashboard. Go to dashboard to view!
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsChatOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-2xl flex items-center justify-center relative cursor-pointer group"
            >
              <Bot className="h-6 w-6" />
              <span className="absolute right-full mr-3 bg-slate-950 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
                Test AI Booking Assistant
              </span>
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white animate-pulse"></span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display font-bold text-lg text-white">LeadFlow</span>
          </div>

          <div className="flex space-x-8 text-sm font-semibold">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#benefits" className="hover:text-white transition">Benefits</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <a href="#faq" className="hover:text-white transition">FAQ</a>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            &copy; {new Date().getFullYear()} LeadFlow Technologies Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
