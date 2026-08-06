import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import Benefits from '../components/Benefits';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import Contact from '../components/Contact';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 selection:bg-indigo-100">
      <Navbar />
      <Hero />
      <Features />
      <Benefits />
      <Pricing />
      <FAQ />
      <Contact />
      <Footer />
    </div>
  );
}
