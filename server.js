// server.js — AI 招聘助手后端服务
// 对接 DeepSeek API，为三个前端模块提供真实 AI 分析能力
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();


if (!DEEPSEEK_API_KEY) {
  console.error('ERROR: DEEPSEEK_API_KEY not found in .env');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ============================================================
// 通用：调用 DeepSeek API（用原生 https 模块，避免 fetch 中文编码问题）
// ============================================================
function callDeepSeek(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    // 用 Buffer 发送 body，彻底解决 ByteString 编码问题
    const postData = Buffer.from(JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 4096
    }), 'utf-8');

    const urlObj = new URL(DEEPSEEK_API_URL);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error('DeepSeek API error: ' + res.statusCode + ' - ' + body));
            return;
          }
          const data = JSON.parse(body);
          resolve(data.choices[0].message.content);
        } catch (e) {
          reject(new Error('Failed to parse DeepSeek response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('DeepSeek request failed: ' + e.message)));
    req.write(postData);
    req.end();
  });
}

// ============================================================
// API 1：简历智能匹配分析
// ============================================================
app.post('/api/resume-analyze', async (req, res) => {
  try {
    const { resume, jd } = req.body;
    if (!resume || !jd) {
      return res.status(400).json({ error: '请同时提供简历和岗位JD' });
    }
    const systemPrompt = '你是一位资深的HR招聘专家，精通简历筛选与人才评估。请严格按照Markdown格式输出分析报告，直接输出内容，不要额外解释。';
    const userMessage = '请对以下简历和岗位JD进行深度匹配分析：\n\n【候选人简历】\n' + resume + '\n\n【岗位JD】\n' + jd + '\n\n分析报告格式要求：\n\n## 综合匹配度\n给出一个0-100的评分，并解释评分理由（2-3句话）\n\n## 候选人信息卡\n- 提取姓名、毕业院校、学历、专业\n- 简要概括亮点\n\n## 技能画像\n列出候选人拥有的关键技能\n\n## 匹配点（3-5项）\n逐项说明候选人与JD的匹配之处\n\n## 待提升点（2-3项）\n指出候选人与JD要求之间的差距\n\n## 简历优化建议（3条）\n给出具体可操作的简历修改建议\n\n## 面试关注点（3个）\n根据该简历，列出面试官可能重点追问的问题';
    const result = await callDeepSeek(systemPrompt, userMessage);
    res.json({ result });
  } catch (error) {
    console.error('Resume analyze error:', error.message);
    res.status(500).json({ error: 'AI analysis failed: ' + error.message });
  }
});

// ============================================================
// API 2：JD 智能撰写
// ============================================================
app.post('/api/jd-generate', async (req, res) => {
  try {
    const { position, location, department, responsibilities, requirements, bonus } = req.body;
    if (!position) {
      return res.status(400).json({ error: '请至少填写岗位名称' });
    }
    const systemPrompt = '你是一位资深的HR招聘专家，擅长撰写专业、有吸引力的招聘JD。请严格按照Markdown格式输出，直接输出内容，不要额外解释。';
    const userMessage = '请根据以下信息生成一份专业规范的岗位JD：\n\n- 岗位名称：' + position + '\n- 工作地点：' + (location || '待定') + '\n- 所属部门：' + (department || '待定') + '\n- 核心职责：' + (responsibilities || '待定') + '\n- 任职要求：' + (requirements || '待定') + '\n- 加分项：' + (bonus || '待定') + '\n\nJD格式要求：\n\n## 岗位概览\n岗位名称、工作地点、所属部门、汇报对象、工作性质\n\n## 岗位职责\n用动词+任务+成果的结构列出5-8条核心职责\n\n## 任职要求\n分为必备条件和加分条件两部分\n\n## 我们提供\n列出3-4条该岗位的吸引点\n\n## 关于我们\n用2-3句话介绍公司/团队';
    const result = await callDeepSeek(systemPrompt, userMessage);
    res.json({ result });
  } catch (error) {
    console.error('JD generate error:', error.message);
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

// ============================================================
// API 3：面试题库生成
// ============================================================
app.post('/api/interview-questions', async (req, res) => {
  try {
    const { position, level, abilities, extra } = req.body;
    if (!position) {
      return res.status(400).json({ error: '请至少填写岗位名称' });
    }
    const systemPrompt = '你是一位资深的面试官和HR招聘专家，精通结构化面试设计。请严格按照Markdown格式输出，直接输出内容，不要额外解释。';
    const userMessage = '请为以下岗位生成一套结构化面试题库：\n\n- 岗位：' + position + '\n- 级别：' + (level || '初/中级') + '\n- 核心能力要求：' + (abilities || '请根据该岗位常见要求设定') + '\n- 补充要求：' + (extra || '无特殊要求') + '\n\n面试题库格式要求：\n\n## 行为面试题 (Behavioral)\n输出3道行为面试题，考察候选人过去的经历和行为模式。每道题包含：题目、考察意图、评分要点、追问策略\n\n## 专业能力题 (Professional)\n输出3道专业能力题，考察岗位所需的硬技能。每道题包含：题目、考察意图、评分要点、追问策略\n\n## 情景模拟题 (Situational)\n输出2-3道情景模拟题，考察面对假设工作场景的应对能力。每道题包含：情景描述、问题、考察意图、评分要点\n\n## 面试评分表建议\n给出一个简短的面试评估维度建议（3-4个维度）';
    const result = await callDeepSeek(systemPrompt, userMessage);
    res.json({ result });
  } catch (error) {
    console.error('Interview questions error:', error.message);
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

// ============================================================
// 启动服务
// ============================================================
app.listen(PORT, () => {
  console.log('AI HR Recruiter backend started on port ' + PORT);
});
