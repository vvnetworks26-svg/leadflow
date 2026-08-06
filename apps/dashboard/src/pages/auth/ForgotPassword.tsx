import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mail, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { mapAuthError } from '../../lib/authErrors';

export default function ForgotPassword() {
  const [email,     setEmail]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      const { message } = mapAuthError(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 text-left">

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3 animate-fade-in">
        <Link to="/sign-in" className="inline-flex items-center space-x-3 justify-center">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-400 p-2 rounded-lg text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-slate-950">LeadFlow</span>
        </Link>
        <h2 className="text-2xl font-extrabold text-slate-900 font-display">Reset your password</h2>
        <p className="text-sm text-slate-500">
          Enter your email and we'll send a reset link.
        </p>
      </div>

      {/* Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 sm:rounded-xl sm:px-10 shadow-xl shadow-slate-100/40 space-y-6">

          {submitted ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Check your inbox</p>
              <p className="text-xs text-slate-500">
                If <span className="font-semibold">{email}</span> exists in our system, a password reset link has been sent.
              </p>
              <Link
                to="/sign-in"
                className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                <span>Back to Sign In</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 font-semibold" role="alert">
                  {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
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
                      placeholder="name@company.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs bg-slate-50/50 text-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none transition disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending…</span>
                    </>
                  ) : (
                    <>
                      <span>Send Reset Link</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400">
                Remember your password?{' '}
                <Link to="/sign-in" className="font-semibold text-indigo-600 hover:text-indigo-500">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
