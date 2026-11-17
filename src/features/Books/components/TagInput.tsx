"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  placeholder?: string;
}

/** Add tags one at a time as removable chips — no comma parsing needed. */
export function TagInput({
  tags,
  onChange,
  id,
  placeholder = "Add a tag...",
}: TagInputProps) {
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((item) => item !== tag));
  };

  return (
    <div className="space-y-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-secondary text-secondary-foreground border-0 rounded-full px-3 py-1 flex items-center gap-2"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id={id}
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          className="flex-1 border-border rounded-lg h-10 focus:border-ring focus:ring-ring/20 bg-background"
        />
        <Button
          type="button"
          onClick={addTag}
          disabled={!newTag.trim()}
          variant="outline"
          size="sm"
          className="h-10 px-4 border-border hover:bg-accent hover:border-ring"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
