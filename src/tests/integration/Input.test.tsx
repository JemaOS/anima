import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../../components/ui/Input";

describe("Input Component", () => {
  it("renders correctly", async () => {
    render(<Input placeholder="Enter text" />);
    expect(
      await screen.findByPlaceholderText("Enter text"),
    ).toBeInTheDocument();
  });

  it("handles change events", async () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} placeholder="Type here" />);

    const input = await screen.findByPlaceholderText("Type here");
    fireEvent.change(input, { target: { value: "Hello" } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Hello");
  });

  it("displays error message", async () => {
    render(<Input error="Invalid input" />);
    expect(await screen.findByText("Invalid input")).toBeInTheDocument();
  });

  it("applies error styles", async () => {
    render(<Input error="Error" placeholder="Error input" />);
    const input = await screen.findByPlaceholderText("Error input");
    expect(input).toHaveClass("border-danger-500");
  });
});
