import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';

interface NavbarProps {
  isSignedIn?: boolean;
}

export default function Navbar({ isSignedIn }: NavbarProps) {
  return (
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
            <a
              href={`${import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:3000'}/dashboard`}
              className="inline-flex items-center space-x-1 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <>
              <a
                href={`${import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:3000'}/sign-in`}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 transition"
              >
                Sign In
              </a>
              <a
                href={`${import.meta.env.VITE_DASHBOARD_URL ?? 'http://localhost:3000'}/sign-up`}
                className="bg-slate-950 hover:bg-slate-900 text-white text-sm font-semibold px-4.5 py-2.5 rounded-lg transition shadow-md hover:shadow-lg hover:shadow-slate-100"
              >
                Try Free
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
