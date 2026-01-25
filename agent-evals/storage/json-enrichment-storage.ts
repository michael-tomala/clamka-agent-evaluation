/**
 * JsonEnrichmentStorage - In-memory implementacja IEnrichmentStorage dla testów
 *
 * Przechowuje dane w pamięci (Map), nie wymaga better-sqlite3.
 * Używana przez testing API zamiast SqliteEnrichmentStorage.
 */

import { v4 as uuid } from 'uuid';
import type { IEnrichmentStorage } from '../../../shared/storage';
import type {
  MediaAssetFocusPoint,
  CreateMediaAssetFocusPointInput,
  UpdateMediaAssetFocusPointInput,
  MediaAssetTranscriptionSegment,
  CreateMediaAssetTranscriptionSegmentInput,
  UpdateMediaAssetTranscriptionSegmentInput,
  MediaAssetFace,
  CreateMediaAssetFaceInput,
  UpdateMediaAssetFaceInput,
  MediaAssetScene,
  CreateMediaAssetSceneInput,
  SceneDescription,
} from '../../../shared/types';

export class JsonEnrichmentStorage implements IEnrichmentStorage {
  private focusPoints = new Map<string, MediaAssetFocusPoint>();
  private transcriptionSegments = new Map<string, MediaAssetTranscriptionSegment>();
  private faces = new Map<string, MediaAssetFace>();
  private scenes = new Map<string, MediaAssetScene>();

  // ============================================================================
  // FOCUS POINTS
  // ============================================================================

  getFocusPointById(id: string): MediaAssetFocusPoint | undefined {
    return this.focusPoints.get(id);
  }

  getFocusPointsByAssetId(assetId: string): MediaAssetFocusPoint[] {
    return Array.from(this.focusPoints.values())
      .filter((fp) => fp.assetId === assetId)
      .sort((a, b) => a.fileRelativeFrame - b.fileRelativeFrame);
  }

  getFocusPointsByAssetIdInRange(
    assetId: string,
    start: number,
    end: number | null
  ): MediaAssetFocusPoint[] {
    return this.getFocusPointsByAssetId(assetId).filter((fp) => {
      if (end !== null) {
        return fp.fileRelativeFrame >= start && fp.fileRelativeFrame <= end;
      }
      return fp.fileRelativeFrame >= start;
    });
  }

  createFocusPoint(input: CreateMediaAssetFocusPointInput): MediaAssetFocusPoint {
    const now = new Date().toISOString();
    const id = uuid();
    const focusPoint: MediaAssetFocusPoint = {
      id,
      assetId: input.assetId,
      fileRelativeFrame: input.fileRelativeFrame,
      description: input.description,
      focusX: input.focusX,
      focusY: input.focusY,
      orderIndex: input.orderIndex ?? 0,
      createdDate: now,
      modifiedDate: now,
    };

    this.focusPoints.set(id, focusPoint);
    return focusPoint;
  }

  updateFocusPoint(id: string, updates: UpdateMediaAssetFocusPointInput): void {
    const existing = this.focusPoints.get(id);
    if (!existing) return;

    const updated: MediaAssetFocusPoint = {
      ...existing,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };

    this.focusPoints.set(id, updated);
  }

  deleteFocusPoint(id: string): void {
    this.focusPoints.delete(id);
  }

  replaceFocusPointsForAsset(
    assetId: string,
    points: Omit<CreateMediaAssetFocusPointInput, 'assetId'>[]
  ): MediaAssetFocusPoint[] {
    // Usuń istniejące
    for (const [id, fp] of this.focusPoints.entries()) {
      if (fp.assetId === assetId) {
        this.focusPoints.delete(id);
      }
    }

    // Dodaj nowe
    return points.map((point, index) =>
      this.createFocusPoint({
        ...point,
        assetId,
        orderIndex: point.orderIndex ?? index,
      })
    );
  }

  countFocusPointsByAssetId(assetId: string): number {
    return this.getFocusPointsByAssetId(assetId).length;
  }

  // ============================================================================
  // TRANSCRIPTION SEGMENTS
  // ============================================================================

  getTranscriptionById(id: string): MediaAssetTranscriptionSegment | undefined {
    return this.transcriptionSegments.get(id);
  }

  getTranscriptionByAssetId(assetId: string): MediaAssetTranscriptionSegment[] {
    return Array.from(this.transcriptionSegments.values())
      .filter((ts) => ts.assetId === assetId)
      .sort((a, b) => a.fileRelativeStartFrame - b.fileRelativeStartFrame);
  }

  getTranscriptionByAssetIdInRange(
    assetId: string,
    start: number,
    end: number | null
  ): MediaAssetTranscriptionSegment[] {
    return this.getTranscriptionByAssetId(assetId).filter((ts) => {
      if (end !== null) {
        // Segment nakłada się na zakres jeśli jego start < koniec zakresu I jego koniec > początek zakresu
        return ts.fileRelativeStartFrame < end && ts.fileRelativeEndFrame > start;
      }
      return ts.fileRelativeEndFrame > start;
    });
  }

  createTranscriptionSegment(
    input: CreateMediaAssetTranscriptionSegmentInput
  ): MediaAssetTranscriptionSegment {
    const now = new Date().toISOString();
    const id = uuid();
    const segment: MediaAssetTranscriptionSegment = {
      id,
      assetId: input.assetId,
      fileRelativeStartFrame: input.fileRelativeStartFrame,
      fileRelativeEndFrame: input.fileRelativeEndFrame,
      text: input.text,
      orderIndex: input.orderIndex ?? 0,
      speakerId: input.speakerId ?? null,
      personId: input.personId ?? null,
      createdDate: now,
      modifiedDate: now,
    };

    this.transcriptionSegments.set(id, segment);
    return segment;
  }

  updateTranscriptionSegment(id: string, updates: UpdateMediaAssetTranscriptionSegmentInput): void {
    const existing = this.transcriptionSegments.get(id);
    if (!existing) return;

    const updated: MediaAssetTranscriptionSegment = {
      ...existing,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };

    this.transcriptionSegments.set(id, updated);
  }

  deleteTranscriptionSegment(id: string): void {
    this.transcriptionSegments.delete(id);
  }

  replaceTranscriptionForAsset(
    assetId: string,
    segments: Omit<CreateMediaAssetTranscriptionSegmentInput, 'assetId'>[]
  ): MediaAssetTranscriptionSegment[] {
    // Usuń istniejące
    for (const [id, ts] of this.transcriptionSegments.entries()) {
      if (ts.assetId === assetId) {
        this.transcriptionSegments.delete(id);
      }
    }

    // Dodaj nowe
    return segments.map((segment, index) =>
      this.createTranscriptionSegment({
        ...segment,
        assetId,
        orderIndex: segment.orderIndex ?? index,
      })
    );
  }

  updateTranscriptionSegmentPerson(segmentId: string, personId: string | null): void {
    const segment = this.transcriptionSegments.get(segmentId);
    if (segment) {
      segment.personId = personId;
      segment.modifiedDate = new Date().toISOString();
    }
  }

  countTranscriptionByAssetId(assetId: string): number {
    return this.getTranscriptionByAssetId(assetId).length;
  }

  // ============================================================================
  // FACES
  // ============================================================================

  getFaceById(id: string): MediaAssetFace | null {
    return this.faces.get(id) ?? null;
  }

  getFacesByAssetId(assetId: string): MediaAssetFace[] {
    return Array.from(this.faces.values())
      .filter((f) => f.mediaAssetId === assetId)
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  }

  getFacesByPersonId(personId: string): MediaAssetFace[] {
    return Array.from(this.faces.values())
      .filter((f) => f.personId === personId)
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  }

  getFacesByProjectId(projectId: string): MediaAssetFace[] {
    // W in-memory storage nie mamy łatwego dostępu do projektów
    // Zwracamy wszystkie faces - w testach to wystarczy
    console.warn('[JsonEnrichmentStorage] getFacesByProjectId not fully implemented for in-memory storage');
    return Array.from(this.faces.values());
  }

  createFace(input: CreateMediaAssetFaceInput): MediaAssetFace {
    const now = new Date().toISOString();
    const id = uuid();
    const face: MediaAssetFace = {
      id,
      mediaAssetId: input.mediaAssetId,
      personId: input.personId ?? null,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      embedding: input.embedding,
      confidence: input.confidence ?? null,
      fileRelativeStartFrame: input.fileRelativeStartFrame ?? null,
      fileRelativeEndFrame: input.fileRelativeEndFrame ?? null,
      createdDate: now,
    };

    this.faces.set(id, face);
    return face;
  }

  updateFace(id: string, updates: UpdateMediaAssetFaceInput): void {
    const existing = this.faces.get(id);
    if (!existing) return;

    const updated: MediaAssetFace = {
      ...existing,
      ...updates,
    };

    this.faces.set(id, updated);
  }

  deleteFace(id: string): void {
    this.faces.delete(id);
  }

  deleteFacesByAssetId(assetId: string): void {
    for (const [id, face] of this.faces.entries()) {
      if (face.mediaAssetId === assetId) {
        this.faces.delete(id);
      }
    }
  }

  countFacesByAssetId(assetId: string): number {
    return this.getFacesByAssetId(assetId).length;
  }

  findFacePresenceBlocksByAssetId(assetId: string): MediaAssetFace[] {
    return this.getFacesByAssetId(assetId).filter(
      (f) => f.fileRelativeStartFrame !== null && f.fileRelativeEndFrame !== null
    );
  }

  updateFacePersonIdBatch(oldPersonId: string, newPersonId: string): number {
    let count = 0;
    for (const face of this.faces.values()) {
      if (face.personId === oldPersonId) {
        face.personId = newPersonId;
        count++;
      }
    }
    return count;
  }

  // ============================================================================
  // SCENES
  // ============================================================================

  getSceneById(id: string): MediaAssetScene | null {
    return this.scenes.get(id) ?? null;
  }

  getScenesByAssetId(assetId: string): MediaAssetScene[] {
    return Array.from(this.scenes.values())
      .filter((s) => s.mediaAssetId === assetId)
      .sort((a, b) => a.startFrame - b.startFrame);
  }

  createScene(input: CreateMediaAssetSceneInput): MediaAssetScene {
    const now = new Date().toISOString();
    const id = uuid();
    const scene: MediaAssetScene = {
      id,
      mediaAssetId: input.mediaAssetId,
      sceneIndex: input.sceneIndex,
      startFrame: input.startFrame,
      endFrame: input.endFrame,
      keyFramePath: input.keyFramePath ?? null,
      description: input.description ?? null,
      createdDate: now,
      modifiedDate: now,
    };

    this.scenes.set(id, scene);
    return scene;
  }

  replaceAllScenesForAsset(
    assetId: string,
    scenesInput: Omit<CreateMediaAssetSceneInput, 'mediaAssetId'>[]
  ): MediaAssetScene[] {
    // Usuń istniejące
    for (const [id, scene] of this.scenes.entries()) {
      if (scene.mediaAssetId === assetId) {
        this.scenes.delete(id);
      }
    }

    // Dodaj nowe
    return scenesInput.map((sceneInput) =>
      this.createScene({
        ...sceneInput,
        mediaAssetId: assetId,
      })
    );
  }

  deleteScenesByAssetId(assetId: string): void {
    for (const [id, scene] of this.scenes.entries()) {
      if (scene.mediaAssetId === assetId) {
        this.scenes.delete(id);
      }
    }
  }

  updateSceneFrames(sceneId: string, startFrame: number, endFrame: number): MediaAssetScene | null {
    const scene = this.scenes.get(sceneId);
    if (!scene) return null;

    scene.startFrame = startFrame;
    scene.endFrame = endFrame;
    scene.modifiedDate = new Date().toISOString();
    return scene;
  }

  updateSceneDescription(sceneId: string, description: SceneDescription): void {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      scene.description = description;
      scene.modifiedDate = new Date().toISOString();
    }
  }

  countScenesByAssetId(assetId: string): number {
    return this.getScenesByAssetId(assetId).length;
  }

  // ===== RESET (dla testów) =====

  reset(): void {
    this.focusPoints.clear();
    this.transcriptionSegments.clear();
    this.faces.clear();
    this.scenes.clear();
  }
}
