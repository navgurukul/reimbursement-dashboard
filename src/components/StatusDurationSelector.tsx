"use client";

import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import {
  calculateLeaveTimes,
  encodeLeaveDuration,
  parseLeaveDuration,
} from "@/lib/leave-status";

export const DURATION_PRESETS = [
  "3 minutes",
  "Today",
  "Tomorrow",

] as const;

interface StatusDurationSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showCustomInline?: boolean;
}

export function StatusDurationSelector({
  value,
  onChange,
  disabled = false,
  className = "",
  showCustomInline = true,
}: StatusDurationSelectorProps) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const getNowDateTimeString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const getDefaultEndDateTimeString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    return tomorrow.toISOString().slice(0, 16);
  };

  // Sync internal state when external value changes
  useEffect(() => {
    if (!value || value.trim() === "") {
      setSelectedType("");
      return;
    }

    const parsed = parseLeaveDuration(value);
    const label = parsed.label;

    if (DURATION_PRESETS.includes(label as any)) {
      setSelectedType(label);
    } else {
      setSelectedType("custom");
      if (parsed.start) {
        try {
          const sDate = new Date(parsed.start);
          sDate.setMinutes(sDate.getMinutes() - sDate.getTimezoneOffset());
          setCustomStart(sDate.toISOString().slice(0, 16));
        } catch {
          // ignore
        }
      }
      if (parsed.end) {
        try {
          const eDate = new Date(parsed.end);
          eDate.setMinutes(eDate.getMinutes() - eDate.getTimezoneOffset());
          setCustomEnd(eDate.toISOString().slice(0, 16));
        } catch {
          // ignore
        }
      }
    }
  }, [value]);

  const handleSelectChange = (val: string) => {
    if (val === "none") {
      setSelectedType("");
      onChange("");
      return;
    }

    if (val === "custom") {
      setSelectedType("custom");
      const start = customStart || getNowDateTimeString();
      const end = customEnd || getDefaultEndDateTimeString();
      setCustomStart(start);
      setCustomEnd(end);
      const times = calculateLeaveTimes("custom", start, end);
      onChange(encodeLeaveDuration(times));
    } else {
      setSelectedType(val);
      const times = calculateLeaveTimes(val);
      onChange(encodeLeaveDuration(times));
    }
  };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setCustomStart(newStart);
    const times = calculateLeaveTimes("custom", newStart, customEnd);
    onChange(encodeLeaveDuration(times));
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    setCustomEnd(newEnd);
    const times = calculateLeaveTimes("custom", customStart, newEnd);
    onChange(encodeLeaveDuration(times));
  };

  const parsedCurrent = parseLeaveDuration(value);

  return (
    <div className={`space-y-2 w-full ${className}`}>
      <Select
        value={selectedType || "none"}
        onValueChange={handleSelectChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full bg-white h-10 border-gray-200">
          <SelectValue placeholder="--Select an option--" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">--Select an option--</SelectItem>
          {DURATION_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{preset}</span>
              </div>
            </SelectItem>
          ))}
          <SelectItem value="custom">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Calendar className="w-3.5 h-3.5" />
              <span>Choose a start and end time...</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {showCustomInline && parsedCurrent.end && selectedType !== "custom" && selectedType !== "none" && (
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1.5 text-slate-700 animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <span className="bg-blue-50 text-blue-700 border border-blue-200/80 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Duration: {parsedCurrent.label}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-slate-600 pl-1 pt-0.5">
            {parsedCurrent.start && (
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-slate-500 font-medium">Applied:</span>
                <span className="font-semibold text-slate-700">
                  {(() => {
                    try {
                      return format(new Date(parsedCurrent.start), "dd MMM yyyy, hh:mm a");
                    } catch {
                      return parsedCurrent.start;
                    }
                  })()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-slate-500 font-medium">Until:</span>
              <span className="font-semibold text-slate-800">
                {(() => {
                  try {
                    return format(new Date(parsedCurrent.end), "dd MMM yyyy, hh:mm a");
                  } catch {
                    return parsedCurrent.end;
                  }
                })()}
              </span>
            </div>
          </div>
        </div>
      )}

      {showCustomInline && selectedType === "custom" && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Start time</Label>
              <Input
                type="datetime-local"
                value={customStart}
                onChange={handleStartChange}
                disabled={disabled}
                className="h-8 text-xs bg-white border-slate-200"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] text-muted-foreground">End time</Label>
              <Input
                type="datetime-local"
                value={customEnd}
                onChange={handleEndChange}
                disabled={disabled}
                className="h-8 text-xs bg-white border-slate-200"
              />
            </div>
          </div>
          {parsedCurrent.label && !DURATION_PRESETS.includes(parsedCurrent.label as any) && (
            <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="truncate">{parsedCurrent.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
