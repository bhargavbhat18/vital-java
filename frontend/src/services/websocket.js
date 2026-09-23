import { useCallback, useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export const createStompClient = (onConnect, onError) => {
  const client = new Client({
    webSocketFactory: () => new SockJS('http://localhost:8000/ws'),
    beforeConnect: () => {
      const token = localStorage.getItem('token');
      client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    onConnect,
    onStompError: onError,
    onWebSocketError: onError,
    onWebSocketClose: onError,
  });
  return client;
};

export function useRealtimeRefresh(uid, emergencyId, patientUid = uid) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tracking, setTracking] = useState(null);
  const [client, setClient] = useState(null);
  const timer = useRef(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const connection = createStompClient(() => {
      if (!active) return;
      setConnected(true);
      setClient(connection);
      refresh();
    }, () => {
      if (!active) return;
      setConnected(false);
      setClient(null);
    });
    connection.activate();
    const poll = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(poll);
      clearTimeout(timer.current);
      timer.current = null;
      window.removeEventListener('focus', refresh);
      connection.deactivate();
    };
  }, [uid, refresh]);

  useEffect(() => {
    if (!client || !connected) return;
    const scheduleRefresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        refresh();
      }, 500);
    };
    const topics = ['/topic/emergency-updates', '/topic/hospital-queue-refresh'];
    if (patientUid) topics.push(`/topic/vitals/${patientUid}`, `/topic/ai-risk/${patientUid}`);
    if (emergencyId != null) topics.push(`/topic/emergency/${emergencyId}`);
    const subscriptions = topics.map(topic => client.subscribe(topic, message => {
      scheduleRefresh();
      if (topic !== `/topic/emergency/${emergencyId}`) return;
      try {
        const data = JSON.parse(message.body);
        if (data && String(data.sosId) === String(emergencyId)) {
          setTracking({ ...data, emergencyId });
        }
      } catch {
        return;
      }
    }));
    return () => {
      clearTimeout(timer.current);
      timer.current = null;
      subscriptions.forEach(subscription => {
        if (client.connected) subscription.unsubscribe();
      });
    };
  }, [client, connected, patientUid, emergencyId, refresh]);

  return { connected, revision, refresh, tracking: tracking?.emergencyId === emergencyId ? tracking : null };
}
