"use client"
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Image, Plus, X, Heart, Cloud, CloudOff } from 'lucide-react';

// File type interface
interface FileData {
  title: string;
  author: string | null;
  image: File | null;
  file: File | null;
  syncToCloud: boolean;
  isFavourite: boolean;
  tags: string[];
}

// Book Add Context Interface
interface BookAddContextType {
  openDialog: (files?: File[]) => void;
  closeDialog: () => void;
  isDialogOpen: boolean;
  isOnline: boolean;
}

// Create Context
const BookAddContext = createContext<BookAddContextType | undefined>(undefined);

// Custom Hook
export function useBookAdd() {
  const context = useContext(BookAddContext);
  if (context === undefined) {
    throw new Error('useBookAdd must be used within a BookAddProvider');
  }
  return context;
}

// File Drop Dialog Component
const FileDropDialog = ({ isOpen, onClose, droppedFiles, isOnline }: {
  isOpen: boolean;
  onClose: () => void;
  droppedFiles: File[];
  isOnline: boolean;
}) => {
  const [formData, setFormData] = useState<FileData>({
    title: '',
    author: null,
    image: null,
    file: null,
    syncToCloud: isOnline,
    isFavourite: false,
    tags: []
  });
  const [newTag, setNewTag] = useState('');
  const [authorInput, setAuthorInput] = useState('');

  // Auto-populate file when dialog opens
  useEffect(() => {
    if (droppedFiles.length > 0) {
      const mainFile = droppedFiles[0];
      setFormData(prev => ({
        ...prev,
        file: mainFile,
        title: mainFile.name.replace(/\.[^/.]+$/, '') // Remove extension
      }));
    }
  }, [droppedFiles]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setFormData(prev => ({ ...prev, image: file }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ 
        ...prev, 
        file: file,
        title: prev.title || file.name.replace(/\.[^/.]+$/, '') // Auto-fill title if empty
      }));
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = () => {
    const finalData = {
      ...formData,
      author: authorInput.trim() || null
    };
    console.log('Book data submitted:', finalData);
    // Handle form submission here
    onClose();
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      title: '',
      author: null,
      image: null,
      file: null,
      syncToCloud: isOnline,
      isFavourite: false,
      tags: []
    });
    setNewTag('');
    setAuthorInput('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-fit overflow-hidden bg-card border-0 shadow-2xl rounded-xl">
        <DialogHeader className="pb-6 border-b border-border">
          <DialogTitle className="text-xl font-medium text-card-foreground flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent-foreground" />
            </div>
            Add Book
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-2">
            Configure your book with metadata and preferences
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(85vh-140px)] scrollbar-thin scrollbar-thumb-muted">
          <div className="space-y-8 p-6">
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Title Field */}
                <div className="space-y-3">
                  <Label htmlFor="title" className="text-sm font-medium text-foreground">
                    Book Title
                  </Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter book title..."
                    className="border-border rounded-lg h-11 focus:border-ring focus:ring-ring/20 bg-background"
                  />
                </div>

                {/* Author Field */}
                <div className="space-y-3">
                  <Label htmlFor="author" className="text-sm font-medium text-foreground">
                    Author
                  </Label>
                  <Input
                    id="author"
                    value={authorInput}
                    onChange={(e) => setAuthorInput(e.target.value)}
                    placeholder="Author name (optional)"
                    className="border-border rounded-lg h-11 focus:border-ring focus:ring-ring/20 bg-background"
                  />
                </div>

                {/* File Upload - Show input if no file is present */}
                {!formData.file ? (
                  <div className="space-y-3">
                    <Label htmlFor="file-upload" className="text-sm font-medium text-foreground">
                      Book File *
                    </Label>
                    <div className="space-y-3">
                      <input
                        type="file"
                        accept=".pdf,.epub,.mobi,.txt,.doc,.docx"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="group flex items-center justify-center gap-3 w-full h-24 border-2 border-dashed border-border rounded-xl hover:border-ring hover:bg-accent/50 cursor-pointer transition-all duration-200"
                      >
                        <Upload className="w-5 h-5 text-muted-foreground group-hover:text-accent-foreground" />
                        <span className="text-sm text-muted-foreground group-hover:text-accent-foreground">
                          Choose book file
                        </span>
                      </label>
                    </div>
                  </div>
                ) : (
                  /* File Display */
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-foreground">
                      Book File
                    </Label>
                    <div className="bg-muted rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-accent-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-card-foreground truncate">
                            {formData.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(formData.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData(prev => ({ ...prev, file: null }))}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Cover Image */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-foreground">
                    Cover Image
                  </Label>
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="group flex items-center justify-center gap-3 w-full h-24 border-2 border-dashed border-border rounded-xl hover:border-ring hover:bg-accent/50 cursor-pointer transition-all duration-200"
                    >
                      <Image className="w-5 h-5 text-muted-foreground group-hover:text-accent-foreground" />
                      <span className="text-sm text-muted-foreground group-hover:text-accent-foreground">
                        {formData.image ? formData.image.name : 'Choose cover image'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium text-foreground">
                    Options
                  </Label>
                  
                  <div className="space-y-3">
                    {/* Sync to Cloud */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        {isOnline ? (
                          <Cloud className="w-4 h-4 text-primary" />
                        ) : (
                          <CloudOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-card-foreground">
                            Cloud Sync
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isOnline ? 'Available' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <Checkbox
                        id="syncToCloud"
                        checked={formData.syncToCloud}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, syncToCloud: checked as boolean }))
                        }
                        disabled={!isOnline}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>

                    {/* Favourite */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <Heart className={`w-4 h-4 ${formData.isFavourite ? 'fill-current text-destructive' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-sm font-medium text-card-foreground">
                            Favourite
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Quick access
                          </p>
                        </div>
                      </div>
                      <Checkbox
                        id="isFavourite"
                        checked={formData.isFavourite}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ ...prev, isFavourite: checked as boolean }))
                        }
                        className="data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <Label className="text-sm font-medium text-foreground">
                Tags
              </Label>
              
              {/* Existing Tags */}
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="secondary" 
                      className="bg-secondary text-secondary-foreground border-0 rounded-full px-3 py-1 flex items-center gap-2"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Add Tag Input */}
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag..."
                  className="flex-1 border-border rounded-lg h-10 focus:border-ring focus:ring-ring/20 bg-background"
                  onKeyPress={(e) => e.key === 'Enter' && addTag()}
                />
                <Button
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
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 pb-0 pt-4 border-t border-border">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="px-6 border-border hover:bg-accent"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.title.trim() || !formData.file}
            className="px-6 bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-sm"
          >
            Add Book
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Main BookAddProvider Component
export function BookAddProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDragging, setIsDragging] = useState(false);
  const [showDropMessage, setShowDropMessage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const openDialog = useCallback((files?: File[]) => {
    if (files) {
      setDroppedFiles(files);
    } else {
      setDroppedFiles([]);
    }
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDroppedFiles([]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
      setShowDropMessage(true);
    }
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only hide if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
      setShowDropMessage(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setShowDropMessage(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      openDialog(files);
    }
  }, [openDialog]);

  const contextValue: BookAddContextType = {
    openDialog,
    closeDialog,
    isDialogOpen: dialogOpen,
    isOnline
  };

  return (
    <BookAddContext.Provider value={contextValue}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative w-full h-full"
      >
        {children}
        
        {/* Drop Overlay with Ripple Animation */}
        {showDropMessage && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            {/* Ripple Background */}
            <div className="absolute inset-0 flex items-center justify-center">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-32 h-32 border-2 border-primary/30 rounded-full animate-ping"
                  style={{
                    animationDelay: `${i * 0.5}s`,
                    animationDuration: '2s'
                  }}
                />
              ))}
            </div>
            
            {/* Central Drop Zone */}
            <div className="relative text-center space-y-6 p-12 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-2xl animate-in fade-in zoom-in duration-300">
              {/* Animated Upload Icon */}
              <div className="relative mx-auto w-20 h-20 mb-6">
                <div className="absolute inset-0 bg-accent rounded-full animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Upload className="w-10 h-10 text-accent-foreground animate-bounce" />
                </div>
              </div>
              
              {/* Text Content */}
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-card-foreground">
                  Drop your books here
                </h2>
                <p className="text-muted-foreground text-lg">
                  Release to add them to your library
                </p>
              </div>
              
              {/* Animated Dots */}
              <div className="flex justify-center gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-primary rounded-full animate-bounce"
                    style={{
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: '1s'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* File Dialog */}
        <FileDropDialog
          isOpen={dialogOpen}
          onClose={closeDialog}
          droppedFiles={droppedFiles}
          isOnline={isOnline}
        />

        {/* Custom Styles */}
        <style jsx>{`
          .scrollbar-thin {
            scrollbar-width: thin;
          }
          
          .scrollbar-thumb-muted::-webkit-scrollbar-thumb {
            background-color: hsl(var(--muted));
            border-radius: 0.375rem;
          }
          
          .scrollbar-thin::-webkit-scrollbar {
            width: 6px;
          }
        `}</style>
      </div>
    </BookAddContext.Provider>
  );
}

// Demo Component showing how to use the hook
export function AddBookButton() {
  const { openDialog } = useBookAdd();

  return (
    <Button 
      onClick={() => openDialog()}
      className="flex items-center gap-2"
    >
      <Plus className="w-4 h-4" />
      Add Book
    </Button>
  );
}