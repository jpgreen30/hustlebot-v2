# HustleBot V2 - Telegram Quick Start

**Status:** ✅ Ready to Use

---

## 🎯 Quick Commands

### Test Agent Status
```
/agents ping
```
→ Verifies all 4 agents are running and responsive

### Query DeepSeek (Chat & Reasoning)
```
/deepseek What is machine learning?
```
→ DeepSeek provides detailed explanation

### Code Review (Kimi)
```
/kimi Review this function for performance:
```
→ Kimi analyzes code and provides suggestions

### General Question (ChatGPT)
```
/chatgpt Explain quantum computing
```
→ ChatGPT provides comprehensive answer

### Unconventional Thinking (Grok)
```
/grok What would happen if gravity reversed?
```
→ Grok provides creative, witty response

---

## 📊 Expected Response Times

| Agent | Avg Response | Max Wait |
|-------|-------------|----------|
| DeepSeek | 3-5 sec | 15 sec |
| Kimi | 2-4 sec | 12 sec |
| ChatGPT | 4-6 sec | 20 sec |
| Grok | 2-4 sec | 12 sec |

---

## ⚠️ Troubleshooting

### Agents Not Responding
1. Try `/agents ping` to check status
2. If timeout, agents may be restarting:
   - Check Render dashboard > hustlebot-connectors logs
   - Look for "All connectors running" message
   - Wait 30 seconds and retry

### Telegram Bot Not Responding
1. Verify bot token in environment variables
2. Check main service logs: https://dashboard.render.com
3. Ensure `/health` returns status ok
4. Restart bot if needed

### Slow Responses
- Agents may be processing complex requests
- Check if other agents are running
- Verify Redis connection is stable
- Monitor Render resource usage

### Agent Timeout (>20 seconds)
- Agent may have crashed, wait for restart
- Try `/agents ping` to reset
- Check Background Worker logs for errors
- Consider upgrading Render plan for more resources

---

## 🔄 Service Recovery

### If Main Service Goes Down
1. Render automatically restarts failed services
2. Check dashboard to confirm status
3. Wait 1-2 minutes for automatic restart
4. Try `/agents ping` again

### If Background Worker Crashes
1. Check Render logs for error message
2. Verify environment variables are set
3. Check Redis connection
4. Render will auto-restart within 1 minute

### Manual Restart from Render Dashboard
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select the service
3. Click "Manual Deploy"
4. Wait for deployment to complete

---

## 📈 Performance Tips

- **Batch queries:** Send multiple requests simultaneously for faster throughput
- **Cache responses:** Store frequently asked questions locally
- **Monitor usage:** Check Render metrics for resource utilization
- **Off-peak times:** Use during off-peak for fastest responses

---

## 🚀 Advanced Usage

### Custom Agent Parameters
```
/deepseek:verbose What is AI?
```
→ Detailed response with reasoning

### Agent Priority
High-priority requests are processed first in the queue

### Message TTL
Requests automatically time out after 30 seconds

---

## 📞 Monitoring URLs

- **Main Service Health:** https://hustlebot-v2.onrender.com/health
- **Render Dashboard:** https://dashboard.render.com
- **Logs:** Check Render dashboard for real-time logs

---

**Version:** 1.0  
**Last Updated:** August 15, 2026  
**Status:** ✅ Production Ready
