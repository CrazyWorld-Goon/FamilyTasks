'use strict';

import React from "react";
import ReactDOM from "react-dom/client";
import FamilyTasksHub from "./fabric/FamilyTasksHub";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FamilyTasksHub />
  </React.StrictMode>,
);
