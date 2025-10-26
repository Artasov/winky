import React from 'react';
import { useConfig } from '../context/ConfigContext';

const MePage: React.FC = () => {
  const { config } = useConfig();
  const isAuthorized = Boolean(config?.auth.accessToken);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-text-primary">My Profile</h1>
        <p className="text-sm text-text-secondary">Information about the currently connected account.</p>
      </div>

      {!isAuthorized ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary-200 bg-bg-secondary px-6 py-16 text-center">
          <div className="text-4xl opacity-60">👤</div>
          <p className="text-sm text-text-secondary">Please sign in to view profile data.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Authorization Status</h2>
            <div className="flex items-center gap-3 text-sm text-text-primary">
              <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary animate-pulse-soft" aria-hidden="true" />
              <span>Authorized</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default MePage;

