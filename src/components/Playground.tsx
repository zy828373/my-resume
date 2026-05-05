import { useState } from "react";
import {
  AnimatedNumber,
  AuroraBackground,
  Chip,
  EmptyBox,
  GlowCard,
  MagneticButton,
  ShineBorder,
  SignalPill,
  SpotlightCard,
  StaggerItem,
  StaggerList,
  TiltedCard,
} from "./primitives";
import { setMotionPreference } from "../hooks/useReducedMotion";

/**
 * Hash-triggered dev-only showcase. Visit `/#playground` to render.
 * Used during Phase 1 to verify every primitive works before Phase 3+
 * begins migrating real cards.
 */
export function Playground() {
  const [count, setCount] = useState(1280);
  const [motionOn, setMotionOn] = useState(true);

  return (
    <div className="playground">
      <h1>Primitives Playground</h1>

      <section>
        <h2>Motion toggle</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="ghost-button"
            onClick={() => {
              const next = !motionOn;
              setMotionOn(next);
              setMotionPreference(next);
            }}
          >
            {motionOn ? "关闭动效 (reduced motion)" : "开启动效"}
          </button>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            当前：{motionOn ? "ON" : "OFF"}
          </span>
        </div>
      </section>

      <section>
        <h2>SpotlightCard (mouse-follow radial)</h2>
        <div className="playground-grid">
          {[0, 1, 2, 3].map((i) => (
            <SpotlightCard key={i} className="playground-card">
              <strong>AK-47 | Redline #{i + 1}</strong>
              <span>Spotlight — move cursor across</span>
            </SpotlightCard>
          ))}
        </div>
      </section>

      <section>
        <h2>TiltedCard (3D perspective, maxTilt=6deg)</h2>
        <div className="playground-grid">
          <TiltedCard className="playground-card">
            <strong>Hero item</strong>
            <span>Tilt subtly on mouse move</span>
          </TiltedCard>
          <TiltedCard className="playground-card" maxTilt={10}>
            <strong>More tilt (10deg)</strong>
            <span>For comparison only</span>
          </TiltedCard>
          <TiltedCard className="playground-card" disabled>
            <strong>Disabled</strong>
            <span>No tilt applied</span>
          </TiltedCard>
        </div>
      </section>

      <section>
        <h2>MagneticButton</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <MagneticButton className="primary-button">主按钮 · Magnetic</MagneticButton>
          <MagneticButton className="ghost-button">次按钮</MagneticButton>
          <MagneticButton className="ghost-button" strength={0.5}>
            更强磁力 (0.5)
          </MagneticButton>
          <MagneticButton className="ghost-button" disabled>
            禁用
          </MagneticButton>
        </div>
      </section>

      <section>
        <h2>AnimatedNumber</h2>
        <div
          style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="playground-number">
            <AnimatedNumber value={count} />
          </div>
          <button
            className="ghost-button"
            onClick={() => setCount((c) => c + Math.round(Math.random() * 1000))}
          >
            +随机
          </button>
          <button className="ghost-button" onClick={() => setCount(0)}>
            重置
          </button>
        </div>
      </section>

      <section>
        <h2>ShineBorder (rotating scan-line)</h2>
        <div className="playground-grid">
          <ShineBorder tone="accent">
            <div className="playground-card">
              <strong>Accent shine</strong>
              <span>Entry signal</span>
            </div>
          </ShineBorder>
          <ShineBorder tone="warn">
            <div className="playground-card">
              <strong>Warning shine</strong>
              <span>Backfill alert</span>
            </div>
          </ShineBorder>
          <ShineBorder tone="danger">
            <div className="playground-card">
              <strong>Danger shine</strong>
              <span>Exit tone</span>
            </div>
          </ShineBorder>
          <ShineBorder tone="success">
            <div className="playground-card">
              <strong>Success shine</strong>
              <span>Confirm signal</span>
            </div>
          </ShineBorder>
        </div>
      </section>

      <section>
        <h2>GlowCard (severity halo, static)</h2>
        <div className="playground-grid">
          {(["success", "warn", "danger", "info", "accent", "neutral"] as const).map(
            (tone) => (
              <GlowCard key={tone} tone={tone} className="playground-card">
                <strong>{tone}</strong>
                <span>tone-{tone}</span>
              </GlowCard>
            ),
          )}
        </div>
      </section>

      <section>
        <h2>AuroraBackground (hero-only)</h2>
        <AuroraBackground className="playground-card" style={{ minHeight: 200 }}>
          <strong>Market pulse</strong>
          <span>Aurora animated backdrop — used 1x per page max</span>
        </AuroraBackground>
      </section>

      <section>
        <h2>StaggerList</h2>
        <StaggerList
          as="div"
          className="playground-grid"
          key={`stagger-${motionOn}`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <StaggerItem key={i} className="playground-card">
              <strong>#{i + 1}</strong>
              <span>Stagger item</span>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      <section>
        <h2>Chip / SignalPill / EmptyBox</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip>普通</Chip>
          <Chip variant="muted">灰</Chip>
          <SignalPill tone="buy">买入</SignalPill>
          <SignalPill tone="sell">卖出</SignalPill>
          <SignalPill tone="warning">观望</SignalPill>
          <SignalPill tone="neutral">中性</SignalPill>
        </div>
        <EmptyBox title="暂无数据">
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            EmptyBox placeholder
          </span>
        </EmptyBox>
      </section>
    </div>
  );
}
