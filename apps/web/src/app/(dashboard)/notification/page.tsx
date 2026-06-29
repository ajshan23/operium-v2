"use client";

import React, { useState } from "react";
import {
  Bell, CheckCircle2, MessageSquare, RefreshCw, AlertTriangle,
  Settings, Check, Brain, Clock, ChevronRight, X
} from "lucide-react";

type NotificationType = "mention" | "sync" | "system" | "memory";
type FilterTab = "all" | NotificationType;

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  time: string;
  read: boolean;
  actionUrl?: string;
  icon: React.ReactNode;
  iconColor: string;
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "mention",
      title: "Mentioned in Cowork Session",
      description: "@nikita mentioned you in 'Auth Refactor Planning'",
      time: "10 mins ago",
      read: false,
      icon: <MessageSquare className="w-4 h-4" />,
      iconColor: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
    },
    {
      id: "2",
      type: "sync",
      title: "GitHub Sync Completed",
      description: "Successfully imported 3 new commits to history",
      time: "2 hours ago",
      read: false,
      icon: <RefreshCw className="w-4 h-4" />,
      iconColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    },
    {
      id: "3",
      type: "system",
      title: "Operium v2.1 Update",
      description: "New terminal commands added. Check the release notes.",
      time: "5 hours ago",
      read: true,
      icon: <Settings className="w-4 h-4" />,
      iconColor: "text-blue-400 bg-blue-500/10 border-blue-500/20"
    },
    {
      id: "4",
      type: "sync",
      title: "Azure DevOps Sync Failed",
      description: "Personal Access Token expired. Please update your settings.",
      time: "Yesterday",
      read: true,
      icon: <AlertTriangle className="w-4 h-4" />,
      iconColor: "text-rose-400 bg-rose-500/10 border-rose-500/20"
    },
    {
      id: "5",
      type: "memory",
      title: "Auto-summary Generated",
      description: "Session 'DB Migration' has been summarized and added to memory.",
      time: "Yesterday",
      read: true,
      icon: <Brain className="w-4 h-4" />,
      iconColor: "text-purple-400 bg-purple-500/10 border-purple-500/20"
    }
  ]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const removeNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filteredNotifications = notifications.filter(n => filter === "all" || n.type === filter);
  const unreadCount = notifications.filter(n => !n.read).length;

  const tabs: { id: FilterTab, label: string }[] = [
    { id: "all", label: "All" },
    { id: "mention", label: "Mentions" },
    { id: "sync", label: "Sync Events" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#030303] text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg relative">
            <Bell className="w-5 h-5 text-indigo-400" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full animate-pulse border border-[#030303]"></span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-sm text-gray-400">Manage your workspace notifications</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="flex items-center space-x-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Mark all read</span>
          </button>
          <button
            onClick={clearAll}
            disabled={notifications.length === 0}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-lg text-sm text-gray-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">

        {/* Tabs */}
        <div className="flex items-center space-x-1 mb-6 border-b border-white/5 pb-px">
          {tabs.map(tab => {
            const count = tab.id === "all"
              ? notifications.length
              : notifications.filter(n => n.type === tab.id).length;

            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors text-sm font-medium ${
                  filter === tab.id
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:border-white/20"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  filter === tab.id ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-gray-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
            </div>
            <h3 className="text-lg font-medium text-white mb-1">You&apos;re all caught up!</h3>
            <p className="text-gray-500 text-sm">No new notifications in this category.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => markAsRead(notification.id)}
                className={`group flex items-start space-x-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  notification.read
                    ? "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                    : "bg-indigo-500/[0.02] border-indigo-500/20 hover:bg-indigo-500/[0.05]"
                }`}
              >
                {/* Unread Indicator */}
                <div className="mt-2 w-2 h-2 shrink-0 flex items-center justify-center">
                  {!notification.read && (
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                  )}
                </div>

                {/* Icon */}
                <div className={`p-2 rounded-lg border shrink-0 ${notification.iconColor}`}>
                  {notification.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm font-medium ${notification.read ? "text-gray-300" : "text-white"}`}>
                      {notification.title}
                    </h4>
                    <span className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3 h-3 mr-1" />
                      {notification.time}
                    </span>
                  </div>
                  <p className={`text-sm ${notification.read ? "text-gray-500" : "text-gray-400"}`}>
                    {notification.description}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity pl-4">
                  <button
                    onClick={(e) => removeNotification(notification.id, e)}
                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Remove notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
