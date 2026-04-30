import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { UserJourney } from "./pages/UserJourney";
import { ObservabilityJourney } from "./pages/ObservabilityJourney";

export const App = () => {
  return (
    <Page>
      <Page.Main>
        <Routes>
          <Route path="/" element={<UserJourney />} />
          <Route path="/journey" element={<ObservabilityJourney />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
