import { useEffect, useRef, useState, useCallback } from "react";
import { Client, ActivationState } from "@stomp/stompjs";

// Polyfill for TextEncoder/TextDecoder required by stompjs in React Native
import * as TextEncoding from "text-encoding";
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoding.TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextEncoding.TextDecoder as any;
}

const STOMP_TRANSPORTS = [
  { label: "native:/ws", wsUrl: "ws://10.108.5.101:8080/ws" },
];

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

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export const useWebSocket = (sessionId?: string) => {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [initialAlerts, setInitialAlerts] = useState<Alert[]>([]);
  const [newAlert, setNewAlert] = useState<Alert | null>(null);
  const stompClientRef = useRef<Client | null>(null);
  const currentTransportIndexRef = useRef(0);
  const connectedOnceRef = useRef(false);
  const queuedLocationRef = useRef<{
    longitude: number;
    latitude: number;
  } | null>(null);

  useEffect(() => {
    // Ensure deterministic startup transport after fast refresh/reloads.
    currentTransportIndexRef.current = 0;

    const nativeWebSocket = globalThis.WebSocket;
    if (!nativeWebSocket) {
      console.error("WebSocket is not available in this runtime");
      setStatus("disconnected");
      return;
    }

    const getCurrentTransport = () =>
      STOMP_TRANSPORTS[currentTransportIndexRef.current];
    const getCurrentTransportLabel = () => getCurrentTransport().label;
    const withSessionQuery = (url: string) => {
      if (!sessionId) {
        return url;
      }

      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}sessionId=${encodeURIComponent(sessionId)}`;
    };

    const getCurrentBrokerUrl = () => {
      const transport = getCurrentTransport();
      return transport.wsUrl ? withSessionQuery(transport.wsUrl) : undefined;
    };
    const createSocket = () => {
      const transport = getCurrentTransport();
      return new nativeWebSocket(withSessionQuery(transport.wsUrl!), [
        "v12.stomp",
        "v11.stomp",
        "v10.stomp",
      ]);
    };

    const client = new Client({
      brokerURL: getCurrentBrokerUrl(),
      connectHeaders: sessionId ? { "X-Session-Id": sessionId } : {},
      connectionTimeout: 20000,
      // Do not rely on STOMP global lookup in React Native; use native socket directly.
      webSocketFactory: () => createSocket(),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      forceBinaryWSFrames: true, // ← sends as binary, NULL bytes preserved
      appendMissingNULLonIncoming: true,
      debug: (str) =>
        console.log(`[STOMP Debug][${getCurrentTransportLabel()}]`, str),
      beforeConnect: () => {
        console.log("Activating STOMP transport", {
          transport: getCurrentTransportLabel(),
          hasSessionHeader: Boolean(sessionId),
          brokerURL: getCurrentBrokerUrl(),
        });
      },
      onConnect: () => {
        connectedOnceRef.current = true;
        console.log("STOMP connected on", getCurrentTransportLabel());
        setStatus("connected");

        if (queuedLocationRef.current) {
          const { longitude, latitude } = queuedLocationRef.current;
          client.publish({
            destination: "/app/location.update",
            body: JSON.stringify({ longitude, latitude }),
          });
          queuedLocationRef.current = null;
        }

        // Subscribe to private channel for nearby alerts
        // The backend uses StompPrincipal to route this specifically to our session
        client.subscribe("/user/queue/alerts", (message) => {
          if (message.body) {
            try {
              const alerts: Alert[] = JSON.parse(message.body);
              setInitialAlerts(alerts);
            } catch (err) {
              console.error("Failed to parse alerts", err);
            }
          }
        });

        // Subscribe to broadcast channel for newly created alerts from any user
        client.subscribe("/topic/alerts.new", (message) => {
          if (message.body) {
            try {
              const alert: Alert = JSON.parse(message.body);
              setNewAlert(alert);
            } catch (err) {
              console.error("Failed to parse new alert", err);
            }
          }
        });
      },
      onDisconnect: () => {
        console.log("STOMP disconnected");
        setStatus("disconnected");
      },
      onStompError: (frame) => {
        console.error("STOMP Broker error: " + frame.headers["message"]);
        console.error("Additional details: " + frame.body);
      },
      onWebSocketError: (error) => {
        console.error("WebSocket Error on", getCurrentTransportLabel(), error);
        setStatus("reconnecting");
      },
      onWebSocketClose: (event) => {
        console.log("WebSocket connection closed", {
          transport: getCurrentTransportLabel(),
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        // If we have not connected yet, rotate transport and retry.
        if (!connectedOnceRef.current && STOMP_TRANSPORTS.length > 1) {
          currentTransportIndexRef.current =
            (currentTransportIndexRef.current + 1) % STOMP_TRANSPORTS.length;
          console.log(
            "Switching STOMP transport to",
            getCurrentTransportLabel(),
          );
        }

        setStatus("reconnecting");
      },
      onChangeState: (state) => {
        if (state === ActivationState.ACTIVE) {
          setStatus("reconnecting");
        } else if (
          state === ActivationState.DEACTIVATING ||
          state === ActivationState.INACTIVE
        ) {
          setStatus("disconnected");
        }
      },
    });

    try {
      setStatus("reconnecting");
      client.activate();
    } catch (error) {
      console.error("Failed to activate STOMP client", error);
      setStatus("disconnected");
    }
    stompClientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, []);

  const sendLocation = useCallback((longitude: number, latitude: number) => {
    if (stompClientRef.current && stompClientRef.current.connected) {
      stompClientRef.current.publish({
        destination: "/app/location.update",
        body: JSON.stringify({ longitude, latitude }),
      });
    } else {
      queuedLocationRef.current = { longitude, latitude };
      console.log("Queued location update until STOMP is connected");
    }
  }, []);

  return { status, sendLocation, initialAlerts, newAlert };
};
