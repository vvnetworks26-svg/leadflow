import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/AuthContext';
import { Sparkles, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';
import { mapAuthError } from '../../lib/authErrors';
import { notificationService } from '../../services/notifications/notificationService';

export default function SignUp() {
  const navigate = useNavigate();
  const { signup } = useUser();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await signup(email, firstName, lastName, password);
      navigate('/dashboard');
    } catch (err) {
      const { message, display } = mapAuthError(err);
      if (display === 'toast') {
        notificationService.error('Registration Failed', message);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 text-left">

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3 animate-fade-in">
        <Link to="/" className="inline-flex items-center space-x-3 justify-center">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 p-2 rounded-lg text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-slate-950">LeadFlow</span>
        </Link>
        <h2 className="text-2xl font-extrabold text-slate-900 font-display">Create your account</h2>
        <p className="text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>

      {/* Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 sm:rounded-xl sm:px-10 shadow-xl shadow-slate-100/40 space-y-5">

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 font-semibold" role="alert">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>

            {/* First + Last name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  First Name
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Last Name
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Miller"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="john@millerhvac.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
                />
              </div>
              <p className="text-[10px] text-slate-400">Must be at least 8 characters.</p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none transition disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account…</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400">
            By creating an account you agree to our{' '}
            <span className="text-indigo-600 cursor-pointer hover:underline">Terms of Service</span>.
          </p>

        </div>
      </div>
    </div>
  );
}
