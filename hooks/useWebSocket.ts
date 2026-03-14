import { useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

// Polyfill for TextEncoder/TextDecoder required by stompjs in React Native
import * as TextEncoding from 'text-encoding';
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoding.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextEncoding.TextDecoder as any;
}

const WS_BASE_URL = 'https://undenotable-cyrus-nemoricole.ngrok-free.dev/ws';

export type Alert = {
  alertId: number;
  typeId: number;
  typeName: string;
  longitude: number;
  latitude: number;
  radiusMeters: number;
  timeOfReport: string;
  timeOfExpiry: string;
  creatorSessionId: string;
  active: boolean;
};

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export const useWebSocket = () => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [initialAlerts, setInitialAlerts] = useState<Alert[]>([]);
  const [newAlert, setNewAlert] = useState<Alert | null>(null);
  const stompClientRef = useRef<Client | null>(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE_URL),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      // Debug logging if needed:
      // debug: (str) => console.log('STOMP: ', str),
      onConnect: () => {
        console.log('STOMP connected');
        setStatus('connected');
        
        // Subscribe to private channel for nearby alerts
        // The backend uses StompPrincipal to route this specifically to our session
        client.subscribe('/user/queue/alerts', (message) => {
          if (message.body) {
            try {
              const alerts: Alert[] = JSON.parse(message.body);
              setInitialAlerts(alerts);
            } catch (err) {
              console.error('Failed to parse alerts', err);
            }
          }
        });

        // Subscribe to broadcast channel for newly created alerts from any user
        client.subscribe('/topic/alerts.new', (message) => {
          if (message.body) {
            try {
              const alert: Alert = JSON.parse(message.body);
              setNewAlert(alert);
            } catch (err) {
              console.error('Failed to parse new alert', err);
            }
          }
        });
      },
      onDisconnect: () => {
        console.log('STOMP disconnected');
        setStatus('disconnected');
      },
      onStompError: (frame) => {
        console.error('STOMP Broker error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      },
      onWebSocketError: (error) => {
        console.error('WebSocket Error', error);
        setStatus('reconnecting');
      },
      onWebSocketClose: () => {
        console.log('WebSocket connection closed');
        setStatus('reconnecting');
      }
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, []);

  const sendLocation = useCallback((longitude: number, latitude: number) => {
    if (stompClientRef.current && stompClientRef.current.connected) {
      stompClientRef.current.publish({
        destination: '/app/location.update',
        body: JSON.stringify({ longitude, latitude }),
      });
    } else {
      console.warn('Cannot send location: STOMP client is not connected');
    }
  }, []);

  return { status, sendLocation, initialAlerts, newAlert };
};
