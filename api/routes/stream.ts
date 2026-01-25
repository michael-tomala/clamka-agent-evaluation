/**
 * Stream Routes - WebSocket dla live streaming podczas testów
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { WebSocket } from 'ws';
import { getTestRunnerService, TestEvent } from '../services/test-runner';

export default async function streamRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  const testRunner = getTestRunnerService();

  // Mapa aktywnych połączeń WebSocket (key: jobId lub suiteId lub '*')
  const connectionsByJob = new Map<string, Set<WebSocket>>();
  const connectionsBySuite = new Map<string, Set<WebSocket>>();

  // Słuchaj eventów z test runnera
  testRunner.on('event', (event: TestEvent) => {
    const jobId = event.jobId;
    const suiteId = 'suiteId' in event ? event.suiteId : undefined;
    const message = JSON.stringify(event);

    // Wyślij do subskrybentów jobId
    const jobSubscribers = connectionsByJob.get(jobId);
    if (jobSubscribers) {
      for (const ws of jobSubscribers) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }

    // Wyślij do subskrybentów suiteId
    if (suiteId) {
      const suiteSubscribers = connectionsBySuite.get(suiteId);
      if (suiteSubscribers) {
        for (const ws of suiteSubscribers) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        }
      }
    }

    // Broadcast do wszystkich (dla dashboardu)
    const allSubscribers = connectionsByJob.get('*');
    if (allSubscribers) {
      for (const ws of allSubscribers) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  });

  /**
   * WebSocket /api/stream/:jobId - subskrybuj eventy dla joba
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/stream/:jobId',
    { websocket: true },
    (socket, request) => {
      const { jobId } = request.params;
      const ws = socket as unknown as WebSocket;

      // Dodaj do subskrybentów
      if (!connectionsByJob.has(jobId)) {
        connectionsByJob.set(jobId, new Set());
      }
      connectionsByJob.get(jobId)!.add(ws);

      console.log(`[WebSocket] Client connected for job: ${jobId}`);

      // Wyślij aktualny status
      testRunner.getJobStatus(jobId).then((status) => {
        if (status && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'status', ...status }));
        }
      });

      // Obsłuż zamknięcie
      ws.on('close', () => {
        connectionsByJob.get(jobId)?.delete(ws);
        if (connectionsByJob.get(jobId)?.size === 0) {
          connectionsByJob.delete(jobId);
        }
        console.log(`[WebSocket] Client disconnected from job: ${jobId}`);
      });

      // Obsłuż błędy
      ws.on('error', (err) => {
        console.error(`[WebSocket] Error for job ${jobId}:`, err);
        connectionsByJob.get(jobId)?.delete(ws);
      });
    }
  );

  /**
   * WebSocket /api/stream/suite/:suiteId - subskrybuj eventy dla suite'a
   */
  fastify.get<{ Params: { suiteId: string } }>(
    '/stream/suite/:suiteId',
    { websocket: true },
    (socket, request) => {
      const { suiteId } = request.params;
      const ws = socket as unknown as WebSocket;

      // Dodaj do subskrybentów
      if (!connectionsBySuite.has(suiteId)) {
        connectionsBySuite.set(suiteId, new Set());
      }
      connectionsBySuite.get(suiteId)!.add(ws);

      console.log(`[WebSocket] Client connected for suite: ${suiteId}`);

      // Obsłuż zamknięcie
      ws.on('close', () => {
        connectionsBySuite.get(suiteId)?.delete(ws);
        if (connectionsBySuite.get(suiteId)?.size === 0) {
          connectionsBySuite.delete(suiteId);
        }
        console.log(`[WebSocket] Client disconnected from suite: ${suiteId}`);
      });

      // Obsłuż błędy
      ws.on('error', (err) => {
        console.error(`[WebSocket] Error for suite ${suiteId}:`, err);
        connectionsBySuite.get(suiteId)?.delete(ws);
      });
    }
  );

  /**
   * WebSocket /api/stream - subskrybuj wszystkie eventy
   */
  fastify.get('/stream', { websocket: true }, (socket, _request) => {
    const ws = socket as unknown as WebSocket;

    // Dodaj do globalnych subskrybentów
    if (!connectionsByJob.has('*')) {
      connectionsByJob.set('*', new Set());
    }
    connectionsByJob.get('*')!.add(ws);

    console.log('[WebSocket] Client connected for all events');

    ws.on('close', () => {
      connectionsByJob.get('*')?.delete(ws);
      console.log('[WebSocket] Client disconnected from all events');
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err);
      connectionsByJob.get('*')?.delete(ws);
    });
  });
}
