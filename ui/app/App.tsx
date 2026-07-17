import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { UserJourney } from "./pages/UserJourney";
import { ObservabilityJourney } from "./pages/ObservabilityJourney";
import { SettingsProvider } from "./SettingsContext";
import { TimelapseProvider } from "./TimelapseContext";
import { DisclaimerModal } from "./components/DisclaimerModal";

export const App = () => {
  return (
    <SettingsProvider>
      <TimelapseProvider>
        <DisclaimerModal />
        <Page>
          <Page.Main>
            <Routes>
              <Route path="/" element={<UserJourney />} />
              <Route path="/journey" element={<ObservabilityJourney />} />
            </Routes>
          </Page.Main>
        </Page>
      </TimelapseProvider>
    </SettingsProvider>
  );
};
