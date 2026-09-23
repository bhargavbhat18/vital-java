import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import API from '../services/api';
import UserDashboard from './UserDashboard';
import HealthcareDashboard from './HealthcareDashboard';

const session = vi.hoisted(() => ({ user: { uid: 'patient-1', role: 'PATIENT', fullName: 'Test Patient' } }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: session.user, logout: vi.fn() }) }));
vi.mock('../services/websocket', () => ({
  useRealtimeRefresh: () => ({ connected: true, revision: 0, refresh: vi.fn(), tracking: null }),
}));
vi.mock('../components/MapComponent', () => ({ default: () => <div>Map</div> }));

beforeEach(() => {
  session.user = { uid: 'patient-1', role: 'PATIENT', fullName: 'Test Patient' };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockResponses(queue) {
  return vi.spyOn(API, 'get').mockImplementation(async path => ({
    status: 200,
    data: path === '/hospital/emergencies' ? queue : path === '/emergencies/7' ? {
      id: 7, status: 'HOSPITAL_ASSIGNED', patientUid: 'patient-1',
      patient: { fullName: 'Test Patient' }, currentVitals: { heartRate: 81 },
      medicalHistory: [], previousEmergencies: [],
    } : path.includes('/assessment') || path.includes('/baseline') || path.includes('/predict/') || path.includes('/medical-profile') ? null : [],
  }));
}

describe('queue response regression', () => {
  it.each([[], null, {}])('renders patient history for queue %j', async queue => {
    mockResponses(queue);
    render(<UserDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('No historical events recorded.')).toBeTruthy();
  });

  it('opens hospital emergency details without undefined history variables', async () => {
    session.user = { uid: 'hospital-1', role: 'HOSPITAL_ADMIN', fullName: 'Hospital Admin' };
    const get = mockResponses([{ id: 7, status: 'HOSPITAL_ASSIGNED', patientUid: 'patient-1' }]);
    render(<HealthcareDashboard />);
    fireEvent.click(await screen.findByText('SOS-7'));
    expect(await screen.findByText('Test Patient')).toBeTruthy();
    expect(screen.getByText('81 BPM')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/emergencies/7', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
