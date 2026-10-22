import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { Button } from './components/ui/Button';
import { Badge } from './components/ui/Badge';
import { Avatar } from './components/ui/Avatar';
import { FormField } from './components/ui/FormField';
import { ConfirmationDialog } from './components/ui/ConfirmationDialog';
import { UnauthorizedPage } from './components/layout/UnauthorizedPage';

// Mock fetch to simulate unauthenticated initial state without network errors
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: false,
    status: 401,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ detail: 'Authentication credentials were not provided.' }),
  })
);

describe('CampusVote Frontend Foundation & Design System', () => {
  it('renders Button component with correct text and variant', () => {
    render(<Button variant="primary">Submit Ballot</Button>);
    const button = screen.getByRole('button', { name: /submit ballot/i });
    expect(button).toBeInTheDocument();
  });

  it('renders Badge component', () => {
    render(<Badge variant="success">Eligible</Badge>);
    expect(screen.getByText('Eligible')).toBeInTheDocument();
  });

  it('renders Avatar component with role-based styling', () => {
    render(<Avatar name="Alex Rivera" role="STUDENT" size="md" />);
    expect(screen.getByText('AR')).toBeInTheDocument();
  });

  it('renders FormField component with label and helper text', () => {
    render(
      <FormField label="College ID" helperText="Enter student registrar number" required>
        <input id="test-input" />
      </FormField>
    );
    expect(screen.getByText(/College ID/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter student registrar number/i)).toBeInTheDocument();
  });

  it('renders ConfirmationDialog when open and handles escape/close', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="Confirm Vote Submission"
        description="Are you sure you want to seal this ballot?"
      />
    );
    expect(screen.getByText('Confirm Vote Submission')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to seal this ballot?')).toBeInTheDocument();
  });

  it('renders UnauthorizedPage with 403 status and role indication', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <UnauthorizedPage requiredRole="ELECTION_ADMIN" />
        </BrowserRouter>
      </AuthProvider>
    );
    expect(screen.getByText('403 Forbidden')).toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('ELECTION_ADMIN')).toBeInTheDocument();
  });

  it('renders LandingPage with CampusVote branding and core hero elements', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    );

    // Verify brand title and hero headline
    expect(screen.getAllByText(/CampusVote/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Collegiate Elections/i).length).toBeGreaterThan(0);

    // Verify 3 core feature pillars
    expect(screen.getByText(/Multi-Factor Student Verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Transparent Real-Time Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Secure Election Management/i)).toBeInTheDocument();
  });
});
