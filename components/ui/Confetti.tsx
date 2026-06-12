"use client";

import { useState, useEffect } from "react";
import ReactConfetti from "react-confetti";

export default function Confetti() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setSize({ width: window.innerWidth, height: window.innerHeight });

    const handleResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <ReactConfetti
      width={size.width}
      height={size.height}
      recycle={false}
      numberOfPieces={350}
      gravity={0.25}
      colors={["#22c55e", "#16a34a", "#fbbf24", "#f59e0b", "#ffffff", "#86efac"]}
      style={{ position: "fixed", top: 0, left: 0, zIndex: 9999, pointerEvents: "none" }}
    />
  );
}
