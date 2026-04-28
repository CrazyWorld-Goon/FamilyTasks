import { Component, type ReactNode } from "react";
import App from "../App";
import { I18nProvider } from "../i18n/I18nProvider";

/**
 * Outer document structure used by `@fabric/hub/components/HubInterface` (`fabric-interface` →
 * `fabric-container` → `fabric-react-component`).
 *
 * Importing `HubInterface` in Vite pulls JSX-in-`.js` modules plus `@fabric/core` native addons,
 * which do not bundle for the browser here. This component preserves the same embedding contract
 * and markup so Fabric tooling recognizes the surface, while keeping Family Tasks styling isolated.
 *
 * When this app is hosted inside Fabric Hub’s webpack build, you can swap the root export for
 * `class FamilyTasksHub extends HubInterface` with an overridden `render()` if needed.
 */
export default class FamilyTasksHub extends Component {
  override render(): ReactNode {
    return (
      <fabric-interface className="fabric-site family-tasks-app">
        <fabric-container id="react-application">
          <fabric-react-component id="fabric-hub-application" className="family-tasks-react-root">
            <I18nProvider>
              <App />
            </I18nProvider>
          </fabric-react-component>
        </fabric-container>
      </fabric-interface>
    );
  }
}
