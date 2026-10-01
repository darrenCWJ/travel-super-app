import { render, screen } from "@testing-library/react-native";
import Home from "../src/app/index";

test("the home screen names the app and shows how many apps the generated registry lists", async () => {
  await render(<Home />);
  expect(screen.getByRole("header", { name: "Travel super app" })).toBeTruthy();
  // No feature exists yet, so the registry lists none. If the registry import
  // broke, this file would fail to load, which is part of what it checks.
  expect(screen.getByText("0 apps registered")).toBeTruthy();
});
