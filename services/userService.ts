
import { User, SavedReport, ProducerReport } from "../types";

const USERS_DB_KEY = "sv_users_db"; // Stores { email: { password, name, email } }
const CURRENT_USER_KEY = "sv_current_user";
const REPORTS_KEY = "sv_reports_";

export const userService = {
  login: (email: string, password: string): User => {
    const dbStr = localStorage.getItem(USERS_DB_KEY);
    const db = dbStr ? JSON.parse(dbStr) : {};
    
    const userRecord = db[email];

    if (!userRecord) {
        throw new Error("User not found");
    }

    if (userRecord.password !== password) {
        throw new Error("Invalid password");
    }

    const user: User = { email: userRecord.email, name: userRecord.name };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  register: (email: string, password: string): User => {
    const dbStr = localStorage.getItem(USERS_DB_KEY);
    const db = dbStr ? JSON.parse(dbStr) : {};

    if (db[email]) {
        throw new Error("User already exists");
    }

    const newUser = { 
        email, 
        password, // In a real app, hash this!
        name: email.split('@')[0] 
    };

    db[email] = newUser;
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));

    const user: User = { email: newUser.email, name: newUser.name };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  saveReport: (user: User, report: ProducerReport): SavedReport => {
    const key = REPORTS_KEY + user.email;
    const currentHistoryStr = localStorage.getItem(key);
    const currentHistory: SavedReport[] = currentHistoryStr ? JSON.parse(currentHistoryStr) : [];
    
    // Check if report already exists (simple check to avoid dupes on re-renders)
    const exists = currentHistory.some(h => h.songName === report.songName && h.artistName === report.artistName && new Date(h.date).toDateString() === new Date().toDateString());
    if (exists) return currentHistory[0];

    const newRecord: SavedReport = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      artistName: report.artistName,
      songName: report.songName,
      report: report
    };

    const updatedHistory = [newRecord, ...currentHistory];
    localStorage.setItem(key, JSON.stringify(updatedHistory));
    return newRecord;
  },

  getHistory: (user: User): SavedReport[] => {
    const key = REPORTS_KEY + user.email;
    const currentHistoryStr = localStorage.getItem(key);
    return currentHistoryStr ? JSON.parse(currentHistoryStr) : [];
  }
};
