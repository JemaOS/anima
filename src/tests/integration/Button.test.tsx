import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../../components/ui/Button";

describe("Button Component", () => {
  it("renders children correctly", async () => {
    render(<Button>Click me</Button>);
    expect(await screen.findByText("Click me")).toBeInTheDocument();
  });

  it("handles click events", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    const button = await screen.findByText("Click me");
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies variant classes", async () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(await screen.findByRole("button")).toHaveClass("bg-primary-500");

    rerender(<Button variant="danger">Danger</Button>);
    expect(await screen.findByRole("button")).toHaveClass("bg-danger-500");
  });

  it("can be disabled", async () => {
    render(<Button disabled>Disabled</Button>);
    const button = await screen.findByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:opacity-50");
  });
});
