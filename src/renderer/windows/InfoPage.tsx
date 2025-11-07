import React from 'react';
import {APP_NAME} from '@shared/constants';

const InfoPage: React.FC = () => {
    return (
        <div className="fc mx-auto h-full w-full max-w-4xl gap-8 px-8 py-6">
            <div className="fc gap-1">
                <h1 className="text-3xl font-semibold text-text-primary">Information</h1>
                <p className="text-sm text-text-secondary">Help and information about {APP_NAME}.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <section className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">

                    <h2 className="text-2xl font-bold text-text-primary mb-2">{APP_NAME}</h2>
                    <dl className="fc text-sm">
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Version</dt>
                            <dd className="font-mono text-text-primary">1.0.0</dd>
                        </div>
                        <div className="frbc border-b border-primary-100 py-2">
                            <dt className="text-text-secondary">Platform</dt>
                            <dd className="text-text-primary">Electron + React</dd>
                        </div>
                        <div className="frbc py-2">
                            <dt className="text-text-secondary">Status</dt>
                            <dd className="flex items-center gap-2 text-primary">
                                <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse-soft"
                                      aria-hidden="true"/>
                                Running
                            </dd>
                        </div>
                    </dl>
                </section>

                <section className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
                    <h3 className="mb-4 text-lg font-semibold text-text-primary">Features</h3>
                    <ul className="flex flex-col gap-2 text-sm text-text-primary">
                        <li className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>Speech recognition</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>LLM processing</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>Quick actions</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-primary">✓</span>
                            <span>Floating microphone</span>
                        </li>
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default InfoPage;

