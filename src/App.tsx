import React, { useMemo } from "react";
import { FloatingWidget } from "./components/FloatingWidget";
import { SettingsDashboard } from "./components/SettingsDashboard";
import "./App.css";

export const App: React.FC = () => {
  const isFloating = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("window") === "floating";
  }, []);

  if (isFloating) {
    return <FloatingWidget />;
  }

  return <SettingsDashboard />;
};

export default App;
