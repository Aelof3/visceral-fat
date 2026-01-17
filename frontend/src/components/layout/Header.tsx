/**
 * Application header component
 */

import { Activity } from 'lucide-react';

export function Header() {
  return (
    <header className="header">
      <div className="header-brand">
        <Activity className="header-icon" />
        <h1>Visceral Fat MRI Analysis</h1>
      </div>
      <nav className="header-nav">
        <span className="header-status">Medical Imaging Toolkit</span>
      </nav>
    </header>
  );
}
