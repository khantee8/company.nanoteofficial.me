'use client';

import { useEffect, useRef } from 'react';
import { createEngine, WALL_H } from '@/lib/iso/engine';
import { createCamera } from '@/lib/iso/camera';
import { drawFloorAndWalls, drawWindows, drawZoneLabels } from '@/lib/iso/room';
import { drawFurniture } from '@/lib/iso/furniture';
import { drawCeilingLights } from '@/lib/iso/lights';
import { drawZoneHighlight } from '@/lib/iso/zoneHighlight';
import { Agent } from '@/lib/agents/Agent';
import { startBehaviourLoop, type BehaviourController } from '@/lib/agents/behaviours';
import { loadSprites, type SpriteMap } from '@/lib/agents/sprites';
import { DEPARTMENTS, DEPT_ZONE_BOUNDS, type DeptId } from '@/lib/data/departments';
import type { AgentState } from '@/lib/agents/types';

interface Props {
  selectedDept: DeptId | null;
  terminalHeight: number;
  agentStates?: Partial<Record<DeptId, AgentState>>;
}

export function OfficeCanvas({ selectedDept, terminalHeight, agentStates }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedDeptRef = useRef<DeptId | null>(selectedDept);
  const behaviourRef = useRef<BehaviourController | null>(null);

  useEffect(() => {
    selectedDeptRef.current = selectedDept;
  }, [selectedDept]);

  useEffect(() => {
    if (behaviourRef.current && agentStates) {
      behaviourRef.current.updateServerStates(agentStates);
    }
  }, [agentStates]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = createEngine();
    const camera = createCamera(engine);
    engine.attachContext(ctx);

    const agentList = DEPARTMENTS.map(d => new Agent(d.id, d.shortName, d.color, d.homeX, d.homeY));
    const agents = Object.fromEntries(agentList.map(a => [a.id, a])) as Record<DeptId, Agent>;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      engine.setLayout({ canvasWidth: canvas.width, canvasHeight: canvas.height, wallH: WALL_H });
      camera.reset();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf: number;
    let last = performance.now();
    let sprites: SpriteMap = {};

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      camera.update();
      camera.apply();
      agentList.forEach(a => a.update(dt));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCeilingLights(engine, ctx);
      drawFloorAndWalls(engine);
      drawZoneHighlight(engine, ctx, selectedDeptRef.current, agents);
      drawWindows(engine, ctx);
      drawFurniture(engine, ctx);
      drawZoneLabels(engine, ctx);

      [...agentList].sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy)).forEach(a => a.draw(ctx, engine, sprites));

      raf = requestAnimationFrame(render);
    };

    loadSprites().then(loaded => {
      sprites = loaded;
      const controller = startBehaviourLoop(agents);
      behaviourRef.current = controller;
      raf = requestAnimationFrame(render);
    });

    const handlePan = () => {
      const dept = selectedDeptRef.current;
      if (!dept) {
        camera.reset();
        return;
      }
      const z = DEPT_ZONE_BOUNDS[dept];
      camera.panTo({ gx: z.gx, gy: z.gy }, canvas.width / 2, (canvas.height - terminalHeight) / 2);
    };
    const panInterval = setInterval(handlePan, 200);

    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      if (behaviourRef.current) behaviourRef.current.stop();
      behaviourRef.current = null;
      clearInterval(panInterval);
    };
  }, [terminalHeight]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
