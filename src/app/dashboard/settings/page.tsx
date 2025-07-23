"use client";
import React, { useState } from 'react';
import { User, Mail, Edit3, Save, X, LogOut, Camera, Bell, Shield, Palette, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

// Define the UserInfo type for better type safety
interface UserInfo {
  firstName: string;
  lastName: string;
  email: string;
  profileImage: string | null;
}

// Define the Tab type for the navigation tabs
interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const SettingsPage: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    profileImage: null,
  });
  
  const [tempUserInfo, setTempUserInfo] = useState<UserInfo>(userInfo);
  const [activeTab, setActiveTab] = useState<string>('profile');
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
  });
  const [selectedTheme, setSelectedTheme] = useState('system');

  const handleEdit = () => {
    setIsEditing(true);
    setTempUserInfo(userInfo);
  };

  const handleSave = () => {
    setUserInfo(tempUserInfo);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempUserInfo(userInfo);
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof UserInfo, value: string) => {
    setTempUserInfo(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setTempUserInfo(prev => ({ ...prev, profileImage: e.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    alert('Logging out...');
  };

  const tabs: Tab[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const currentInfo = isEditing ? tempUserInfo : userInfo;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-card-foreground/10 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="text-muted-foreground">Manage your account preferences and settings</p>
            </div>
            <Button variant="destructive" onClick={handleLogout} size="sm" className='cursor-pointer rounded-sm'>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start h-11 px-3 cursor-pointer ${
                      isActive 
                        ? "bg-secondary text-secondary-foreground font-medium" 
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {tab.label}
                  </Button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <div className="flex-1 space-y-6">
            
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <Card className="border-accent">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Profile Information</CardTitle>
                        <CardDescription>
                          Update your personal details and profile picture
                        </CardDescription>
                      </div>
                      {!isEditing ? (
                        <Button onClick={handleEdit} size="sm">
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button onClick={handleCancel} variant="outline" size="sm">
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                          <Button onClick={handleSave} size="sm">
                            <Save className="w-4 h-4 mr-2" />
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Profile Picture */}
                    <div className="space-y-3">
                      <Label>Profile Picture</Label>
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full bg-muted border border-card-foreground/10 flex items-center justify-center overflow-hidden">
                            {currentInfo.profileImage ? (
                              <img
                                src={currentInfo.profileImage}
                                alt="Profile"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-8 h-8 text-muted-foreground" />
                            )}
                          </div>
                          {isEditing && (
                            <>
                              <label
                                htmlFor="profile-upload"
                                className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
                              >
                                <Camera className="w-3 h-3" />
                              </label>
                              <input
                                id="profile-upload"
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </>
                          )}
                        </div>
                        {isEditing && (
                          <div className="text-sm text-muted-foreground">
                            <p>JPG, PNG or WebP. Max 2MB.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Form Fields */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          {isEditing ? (
                            <Input
                              id="firstName"
                              value={tempUserInfo.firstName}
                              onChange={(e) => handleInputChange('firstName', e.target.value)}
                              placeholder="Enter your first name"
                            />
                          ) : (
                            <div className="px-3 py-2 bg-muted/50 border border-card-foreground/10 rounded-md text-sm">
                              {currentInfo.firstName}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          {isEditing ? (
                            <Input
                              id="lastName"
                              value={tempUserInfo.lastName}
                              onChange={(e) => handleInputChange('lastName', e.target.value)}
                              placeholder="Enter your last name"
                            />
                          ) : (
                            <div className="px-3 py-2 bg-muted/50 border border-card-foreground/10 rounded-md text-sm">
                              {currentInfo.lastName}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        {isEditing ? (
                          <Input
                            id="email"
                            type="email"
                            value={tempUserInfo.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            placeholder="Enter your email address"
                          />
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-card-foreground/10 rounded-md text-sm">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            {currentInfo.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'notifications' && (
              <Card className="border-accent">
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>
                    Configure how you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications via email
                      </p>
                    </div>
                    <Switch
                      checked={notifications.email}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => ({ ...prev, email: checked }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive push notifications in your browser
                      </p>
                    </div>
                    <Switch
                      checked={notifications.push}
                      onCheckedChange={(checked) =>
                        setNotifications(prev => ({ ...prev, push: checked }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <Card className="border-accent">
                  <CardHeader>
                    <CardTitle>Security</CardTitle>
                    <CardDescription>
                      Manage your account security settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <div className="text-left">
                        <div className="font-medium">Change Password</div>
                        <div className="text-sm text-muted-foreground">
                          Update your account password
                        </div>
                      </div>
                    </Button>

                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <div className="text-left">
                        <div className="font-medium">Two-Factor Authentication</div>
                        <div className="text-sm text-muted-foreground">
                          Add an extra layer of security to your account
                        </div>
                      </div>
                    </Button>

                    <Button variant="outline" className="w-full justify-start h-auto py-4">
                      <div className="text-left">
                        <div className="font-medium">Active Sessions</div>
                        <div className="text-sm text-muted-foreground">
                          View and manage your active sessions
                        </div>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'appearance' && (
              <Card className="border-accent">
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Customize the look and feel of your interface
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'light', label: 'Light', desc: 'Light mode' },
                        { id: 'system', label: 'System', desc: 'System preference' },
                        { id: 'dark', label: 'Dark', desc: 'Dark mode' }
                      ].map((theme) => (
                        <Button
                          key={theme.id}
                          variant={selectedTheme === theme.id ? "default" : "outline"}
                          className={`h-auto p-4 flex-col gap-2 cursor-pointer ${
                            selectedTheme !== theme.id ? "border-card-foreground/10" : ""
                          }`}
                          onClick={() => setSelectedTheme(theme.id)}
                        >
                          <div className="w-full aspect-video bg-muted border border-card-foreground/10 rounded-sm" />
                          <div className="text-center">
                            <div className="text-sm font-medium">{theme.label}</div>
                            {selectedTheme === theme.id && (
                              <Check className="w-4 h-4 mx-auto mt-1" />
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;