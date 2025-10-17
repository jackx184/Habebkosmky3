const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());

// تحسينات الأداء
class EnhancedMonitoringService {
    constructor() {
        this.activeMonitors = new Map();
        this.requestQueue = [];
        this.isProcessing = false;
    }

    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;
        
        this.isProcessing = true;
        const request = this.requestQueue.shift();
        
        try {
            const result = await this.checkUnits(request.projectId, request.authToken);
            if (result.available) {
                request.callback(result);
            }
        } catch (error) {
            console.error('Queue processing error:', error);
        } finally {
            this.isProcessing = false;
            this.processQueue();
        }
    }

    async checkUnits(projectId, authToken) {
        const url = `https://sakani.sa/marketplaceApi/search/v1/projects/${projectId}/available-units`;
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://sakani.sa/'
                },
                timeout: 8000
            });

            if (response.data?.data?.length > 0) {
                const availableUnit = response.data.data.find(u => u.available);
                if (availableUnit) {
                    return {
                        available: true,
                        unitId: availableUnit.id,
                        unitCode: availableUnit.attributes?.unit_code || availableUnit.id,
                        projectId: projectId,
                        timestamp: new Date().toISOString()
                    };
                }
            }
            
            return { available: false };
        } catch (error) {
            console.error(`Error checking project ${projectId}:`, error.message);
            return { available: false, error: error.message };
        }
    }

    startMonitoring(userId, projects, authToken, callback) {
        if (this.activeMonitors.has(userId)) {
            this.stopMonitoring(userId);
        }

        const monitorInterval = setInterval(() => {
            projects.forEach(projectId => {
                this.requestQueue.push({
                    projectId,
                    authToken,
                    callback,
                    userId
                });
                this.processQueue();
            });
        }, 300); // فحص أسرع

        this.activeMonitors.set(userId, {
            interval: monitorInterval,
            projects: projects,
            lastCheck: new Date()
        });

        return true;
    }

    stopMonitoring(userId) {
        if (this.activeMonitors.has(userId)) {
            const monitor = this.activeMonitors.get(userId);
            clearInterval(monitor.interval);
            this.activeMonitors.delete(userId);
            
            // تنظيف الطلبات القديمة
            this.requestQueue = this.requestQueue.filter(req => req.userId !== userId);
            return true;
        }
        return false;
    }

    getStats() {
        return {
            activeMonitors: this.activeMonitors.size,
            queueLength: this.requestQueue.length,
            users: Array.from(this.activeMonitors.keys())
        };
    }
}

const monitoringService = new EnhancedMonitoringService();

// Routes
app.get('/', (req, res) => {
    res.json({ 
        status: '🚀 JACKX PRO Server Running',
        version: '2.0.0',
        stats: monitoringService.getStats()
    });
});

app.post('/api/monitor/start', async (req, res) => {
    const { userId, projects, authToken } = req.body;
    
    if (!userId || !projects || !authToken) {
        return res.status(400).json({ error: 'بيانات غير مكتملة' });
    }

    if (projects.length > 20) {
        return res.status(400).json({ error: 'تجاوز الحد الأقصى للمشاريع: 20' });
    }

    monitoringService.startMonitoring(userId, projects, authToken, (unitData) => {
        console.log('🎯 وحدة متاحة:', unitData);
        // هنا يمكن إضافة إشعارات
    });

    res.json({ 
        success: true, 
        message: 'بدأت المراقبة عن طريق الخادم',
        userId: userId,
        monitoring: true,
        projects: projects.length
    });
});

app.post('/api/monitor/stop', (req, res) => {
    const { userId } = req.body;
    
    if (monitoringService.stopMonitoring(userId)) {
        res.json({ success: true, message: 'تم إيقاف المراقبة' });
    } else {
        res.json({ success: false, message: 'لا توجد مراقبة نشطة' });
    }
});

app.get('/api/monitor/status/:userId', (req, res) => {
    const { userId } = req.params;
    const isMonitoring = monitoringService.activeMonitors.has(userId);
    res.json({ monitoring: isMonitoring });
});

app.get('/api/stats', (req, res) => {
    res.json(monitoringService.getStats());
});

// تنظيف الذاكرة كل ساعة
cron.schedule('0 * * * *', () => {
    const now = new Date();
    monitoringService.activeMonitors.forEach((monitor, userId) => {
        const timeDiff = now - monitor.lastCheck;
        if (timeDiff > 3600000) { // ساعة واحدة
            monitoringService.stopMonitoring(userId);
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 JACKX PRO Enhanced Server running on port ${PORT}`);
    console.log(`📊 Server features: Queue system, Faster monitoring, Memory management`);
});