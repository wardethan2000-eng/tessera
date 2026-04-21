"use client";

import { Shimmer } from "@/components/ui/Shimmer";

export function DashboardSkeleton() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.58), transparent 26%), radial-gradient(circle at 82% 18%, rgba(210,182,133,0.16), transparent 24%), linear-gradient(180deg, #f7f2e9 0%, #efe7da 100%)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px clamp(18px, 4vw, 28px)",
          borderBottom: "1px solid rgba(128,107,82,0.14)",
          background: "rgba(247,242,233,0.74)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <Shimmer width={86} height={10} borderRadius={999} />
          <Shimmer width={180} height={20} borderRadius={999} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Shimmer width={96} height={14} borderRadius={999} />
          <Shimmer width={84} height={34} borderRadius={999} />
        </div>
      </header>

      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "clamp(30px, 6vw, 48px) clamp(18px, 4vw, 28px) 64px",
        }}
      >
        <section style={{ marginBottom: 34, display: "grid", gap: 14 }}>
          <Shimmer width="min(560px, 70vw)" height={54} borderRadius={22} />
          <Shimmer width="min(760px, 88vw)" height={18} borderRadius={999} />
          <Shimmer width="min(680px, 82vw)" height={18} borderRadius={999} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 36,
          }}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              style={{
                border: "1px solid rgba(128,107,82,0.14)",
                borderRadius: 18,
                background: "rgba(252,248,242,0.82)",
                padding: "16px 18px",
                boxShadow: "0 10px 24px rgba(40,30,18,0.04)",
                display: "grid",
                gap: 10,
              }}
            >
              <Shimmer width={64} height={10} borderRadius={999} />
              <Shimmer width="70%" height={24} borderRadius={999} />
            </div>
          ))}
        </section>

        <section
          style={{
            border: "1px solid rgba(124,108,84,0.2)",
            borderRadius: 28,
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(247,242,233,0.98) 0%, rgba(238,229,216,0.98) 100%)",
            boxShadow: "0 24px 60px rgba(40,30,18,0.08)",
            marginBottom: 30,
          }}
        >
          <div style={{ height: 180, padding: 0 }}>
            <Shimmer width="100%" height="100%" borderRadius={0} />
          </div>
          <div style={{ padding: "clamp(22px, 4vw, 32px)", display: "grid", gap: 16 }}>
            <Shimmer width={140} height={12} borderRadius={999} />
            <Shimmer width="min(360px, 78%)" height={38} borderRadius={18} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 10,
              }}
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <Shimmer key={index} width="100%" height={64} borderRadius={12} />
              ))}
            </div>
            <Shimmer width="100%" height={124} borderRadius={16} />
          </div>
        </section>

        <section
          style={{
            borderTop: "1px solid rgba(128,107,82,0.12)",
            paddingTop: 26,
            display: "grid",
            gap: 18,
          }}
        >
          <Shimmer width={160} height={26} borderRadius={999} />
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            {Array.from({ length: 2 }).map((_, index) => (
              <Shimmer key={index} width="100%" height={300} borderRadius={20} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export function AtriumSkeleton() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          height: 52,
          background: "rgba(246,241,231,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Shimmer width={56} height={10} borderRadius={999} />
          <Shimmer width={120} height={18} borderRadius={999} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Shimmer width={68} height={30} borderRadius={8} />
          <Shimmer width={34} height={30} borderRadius={8} />
          <Shimmer width={92} height={30} borderRadius={8} />
          <Shimmer width={88} height={30} borderRadius={999} />
        </div>
      </header>

      <section
        style={{
          height: "clamp(360px, 62vh, 560px)",
          background: "var(--ink)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "clamp(28px, 5vw, 46px) clamp(20px, 5vw, 52px)",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "grid", gap: 14, width: "min(840px, 100%)" }}>
          <Shimmer width={138} height={28} borderRadius={999} />
          <Shimmer width="min(460px, 86%)" height={48} borderRadius={20} />
          <Shimmer width="min(320px, 64%)" height={16} borderRadius={999} />
          <Shimmer width="min(560px, 96%)" height={16} borderRadius={999} />
          <Shimmer width="min(520px, 88%)" height={16} borderRadius={999} />
        </div>
      </section>

      <section
        style={{
          padding: "30px max(20px, 5vw)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Shimmer width={154} height={42} borderRadius={10} />
        <Shimmer width={138} height={42} borderRadius={10} />
        <Shimmer width={180} height={42} borderRadius={10} />
        <div style={{ marginLeft: "auto" }}>
          <Shimmer width={138} height={32} borderRadius={999} />
        </div>
      </section>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--rule)",
          margin: "0 max(20px, 5vw)",
        }}
      />

      <section
        style={{
          padding: "24px max(20px, 5vw) 0",
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <Shimmer key={index} width="100%" height={110} borderRadius={18} />
        ))}
      </section>

      <section style={{ padding: "28px max(20px, 5vw) 0" }}>
        <Shimmer width="100%" height={126} borderRadius={18} />
      </section>

      <section style={{ padding: "30px max(20px, 5vw) 0" }}>
        <Shimmer width="100%" height={280} borderRadius={22} />
      </section>

      <section style={{ padding: "32px 0 0" }}>
        <div style={{ padding: "0 max(20px, 5vw)", marginBottom: 18, display: "flex", gap: 12 }}>
          <Shimmer width={168} height={24} borderRadius={999} />
          <Shimmer width={120} height={14} borderRadius={999} />
        </div>
        <div
          style={{
            paddingLeft: "max(20px, 5vw)",
            paddingRight: "max(20px, 5vw)",
            display: "flex",
            gap: 14,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <Shimmer
              key={index}
              width="min(240px, calc(100vw - 72px))"
              height={318}
              borderRadius={14}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
