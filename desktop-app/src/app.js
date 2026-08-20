const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');

let sea = null;
try { sea = require('node:sea'); } catch (_) {}

const APP_NAME = '宠物表情包生产台';
const HOST = '127.0.0.1';
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');
const MAX_BODY = 90 * 1024 * 1024;
const ALLOWED_PHOTOS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const KNOWN_PHOTOS = new Set([...ALLOWED_PHOTOS, '.heic', '.heif']);
const jobs = new Map();

function isSea() { return !!(sea && typeof sea.isSea === 'function' && sea.isSea()); }
function exeDir() { return isSea() ? path.dirname(process.execPath) : path.resolve(__dirname, '..'); }
function defaultProjectRoot() {
  let current = exeDir();
  for (let depth = 0; depth < 5; depth++) {
    if (fs.existsSync(path.join(current, 'pet-sticker-studio', 'SKILL.md'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(exeDir(), '..');
}
function projectRoot() { return process.env.PET_MEME_PROJECT_ROOT || defaultProjectRoot(); }
function ordersRoot() { return path.join(projectRoot(), 'orders'); }

function loadUi() {
  if (isSea()) return sea.getAsset('ui.html', 'utf8');
  return fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('上传内容超过 90MB，请压缩照片或分批处理。'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(new Error('提交内容不是有效 JSON。')); }
    });
    req.on('error', reject);
  });
}

function safeText(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(x => safeText(x, 120)).filter(Boolean);
  return safeText(value, 1000).split(/[\n,，;；、]+/).map(x => x.trim()).filter(Boolean).slice(0, 20);
}

function boolValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const v = safeText(value, 30).toLowerCase();
  if (['是', '同意', 'true', 'yes', '1', '保留'].includes(v)) return true;
  if (['否', '不同意', 'false', 'no', '0', '不保留'].includes(v)) return false;
  return fallback;
}

function normalizePetType(value) {
  const v = safeText(value, 40).toLowerCase();
  if (v === 'cat' || v.includes('猫')) return 'cat';
  if (v === 'dog' || v.includes('狗')) return 'dog';
  return '';
}

const FIELD_ALIASES = {
  xhs_order_id: ['小红书订单号', '订单号', '小红书订单编号'],
  customer_nickname: ['小红书昵称', '客户昵称', '昵称'],
  contact: ['联系方式', '微信号', '手机号'],
  pet_name: ['宠物名字', '宠物名称', '宠物名'],
  pet_type: ['宠物类型', '猫或狗', '宠物种类'],
  must_keep_features: ['必须保留的可见特征', '必须保留特征', '宠物特征'],
  must_not_include: ['不希望出现的元素', '禁止元素', '不要出现'],
  keep_collar: ['是否保留照片中的项圈', '保留项圈'],
  notes: ['其他备注', '备注', '补充需求'],
  photo_rights_confirmation: ['照片权利确认', '我拥有照片使用权', '授权确认'],
  case_display_authorization: ['案例展示授权', '是否同意案例展示', '公开展示授权'],
  photos: ['参考照片', '照片上传', '宠物照片', '照片文件或受限云盘链接'],
  form_status: ['表单状态', '处理状态'],
  local_order_id: ['本地订单编号', '内部订单编号'],
};

const REQUIRED_FORM_FIELDS = ['小红书订单号','小红书昵称','宠物名字','宠物类型','参考照片','照片权利确认','案例展示授权'];
const RECOMMENDED_FORM_FIELDS = ['联系方式','是否只有一只宠物','必须保留的可见特征','不希望出现的元素','是否保留照片中的项圈','其他备注','表单状态','本地订单编号'];

function parseFeishuLink(value) {
  const raw = safeText(value, 2000);
  if (!raw) return {appToken:'',tableId:''};
  try {
    const u = new URL(raw);
    const match = u.pathname.match(/\/base\/([^/?#]+)/i);
    return {appToken:match ? match[1] : '', tableId:u.searchParams.get('table') || ''};
  } catch (_) { return {appToken:'',tableId:''}; }
}

function primitiveField(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.every(x => typeof x === 'string' || typeof x === 'number')) return value.join('、');
    return value;
  }
  if (typeof value === 'object') return value.text || value.name || value.value || value.link || '';
  return '';
}

function pickField(fields, key) {
  for (const alias of FIELD_ALIASES[key] || []) {
    if (Object.prototype.hasOwnProperty.call(fields, alias)) return fields[alias];
  }
  return '';
}

function normalizeFeishuRecord(record) {
  const fields = record.fields || record || {};
  const rawPhotos = pickField(fields, 'photos');
  const attachments = Array.isArray(rawPhotos) ? rawPhotos.map(item => ({
    name: safeText(item.name || item.file_name || 'photo', 180),
    file_token: safeText(item.file_token || item.token || '', 300),
    url: safeText(item.tmp_url || item.url || '', 2000),
    size: Number(item.size || 0),
    type: safeText(item.type || '', 80),
  })) : [];
  const keepCollar = primitiveField(pickField(fields, 'keep_collar'));
  const mustNot = splitList(primitiveField(pickField(fields, 'must_not_include')));
  if (keepCollar && !boolValue(keepCollar, true) && !mustNot.includes('项圈')) mustNot.push('项圈');
  return {
    source: 'feishu',
    source_record_id: safeText(record.record_id || record.id || '', 200),
    xhs_order_id: safeText(primitiveField(pickField(fields, 'xhs_order_id')), 120),
    customer_nickname: safeText(primitiveField(pickField(fields, 'customer_nickname')), 120),
    contact: safeText(primitiveField(pickField(fields, 'contact')), 160),
    pet_name: safeText(primitiveField(pickField(fields, 'pet_name')), 80),
    pet_type: normalizePetType(primitiveField(pickField(fields, 'pet_type'))),
    must_keep_features: splitList(primitiveField(pickField(fields, 'must_keep_features'))),
    must_not_include: mustNot,
    notes: safeText(primitiveField(pickField(fields, 'notes')), 1000),
    photo_rights_confirmation: boolValue(primitiveField(pickField(fields, 'photo_rights_confirmation')), false),
    case_display_authorization: boolValue(primitiveField(pickField(fields, 'case_display_authorization')), false),
    attachments,
    form_status: safeText(primitiveField(pickField(fields, 'form_status')), 80),
    local_order_id: safeText(primitiveField(pickField(fields, 'local_order_id')), 80),
    submitted_at: record.created_time ? new Date(Number(record.created_time)).toISOString() : '',
    raw_fields: fields,
  };
}

async function feishuToken(appId, appSecret) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({app_id: appId, app_secret: appSecret}),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) throw new Error(data.msg || `飞书鉴权失败（HTTP ${response.status}）`);
  return data.tenant_access_token;
}

async function listFeishuRecords(config) {
  const token = await feishuToken(config.appId, config.appSecret);
  let pageToken = '';
  const records = [];
  do {
    const endpoint = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(config.tableId)}/records`);
    endpoint.searchParams.set('page_size', '100');
    if (pageToken) endpoint.searchParams.set('page_token', pageToken);
    const response = await fetch(endpoint, {headers: {Authorization: `Bearer ${token}`}});
    const data = await response.json();
    if (!response.ok || data.code !== 0) throw new Error(data.msg || `读取飞书记录失败（HTTP ${response.status}）`);
    records.push(...(data.data?.items || []));
    pageToken = data.data?.has_more ? data.data.page_token : '';
  } while (pageToken && records.length < 500);
  const fields = await listFeishuFields(config, token);
  return {token, fields, records: records.map(normalizeFeishuRecord)};
}

async function listFeishuFields(config, existingToken = '') {
  const token = existingToken || await feishuToken(config.appId, config.appSecret);
  const endpoint = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(config.tableId)}/fields?page_size=100`;
  const response = await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`}});
  const data = await response.json();
  if (!response.ok || data.code !== 0) throw new Error(data.msg || `读取飞书字段失败（HTTP ${response.status}）`);
  return (data.data?.items || []).map(item=>({field_id:item.field_id,field_name:item.field_name,type:item.type,is_primary:item.is_primary||false}));
}

async function inspectFeishu(config) {
  const parsed = parseFeishuLink(config.baseUrl || '');
  config = {...config,appToken:config.appToken||parsed.appToken,tableId:config.tableId||parsed.tableId};
  if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) throw new Error('飞书配置不完整，请填写 App ID、App Secret，并提供包含 table 参数的多维表格链接。');
  const fields = await listFeishuFields(config);
  const names = new Set(fields.map(x=>x.field_name));
  return {config:{...config,appSecret:''},fields,missingRequired:REQUIRED_FORM_FIELDS.filter(x=>!names.has(x)),missingRecommended:RECOMMENDED_FORM_FIELDS.filter(x=>!names.has(x)),writebackReady:names.has('表单状态')&&names.has('本地订单编号')};
}

async function updateFeishuRecord(config, recordId, localOrderId) {
  const token = await feishuToken(config.appId,config.appSecret);
  const fields = await listFeishuFields(config,token);
  const names = new Set(fields.map(x=>x.field_name));
  const update = {};
  if (names.has('表单状态')) update['表单状态'] = '已同步';
  if (names.has('本地订单编号')) update['本地订单编号'] = localOrderId;
  if (!Object.keys(update).length) return {updated:false,warning:'飞书缺少“表单状态”和“本地订单编号”，本地订单已创建但无法回写。'};
  const endpoint = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(config.tableId)}/records/${encodeURIComponent(recordId)}`;
  const response = await fetch(endpoint,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({fields:update})});
  const data = await response.json();
  if (!response.ok || data.code !== 0) throw new Error(data.msg || `飞书回写失败（HTTP ${response.status}）`);
  return {updated:true,fields:update};
}

function cleanFilename(name, index) {
  const ext = path.extname(name).toLowerCase();
  const validExt = KNOWN_PHOTOS.has(ext) ? ext : '.jpg';
  return `photo-${String(index + 1).padStart(2, '0')}${validExt}`;
}

async function nextOrderId() {
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  await fsp.mkdir(ordersRoot(), {recursive: true});
  const names = await fsp.readdir(ordersRoot(), {withFileTypes: true});
  const prefix = `PS-${day}-`;
  const nums = names.filter(x => x.isDirectory() && x.name.startsWith(prefix)).map(x => Number(x.name.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function validatePayload(data) {
  const errors = [];
  if (!safeText(data.pet_name, 80)) errors.push('请填写宠物名字。');
  if (!normalizePetType(data.pet_type)) errors.push('宠物类型只能选择猫或狗。');
  if (!boolValue(data.photo_rights_confirmation, false)) errors.push('必须确认拥有照片使用权，才能开始生产。');
  const photoCount = (data.photos || []).length + (data.attachments || []).length;
  if (photoCount < 5 || photoCount > 8) errors.push(`参考照片共 ${photoCount} 张，必须为 5–8 张。`);
  return errors;
}

async function downloadFeishuAttachment(att, token) {
  let response;
  if (att.file_token) {
    response = await fetch(`https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(att.file_token)}/download`, {headers: {Authorization: `Bearer ${token}`}});
  } else if (att.url && att.url.startsWith('https://')) {
    response = await fetch(att.url, {headers: {Authorization: `Bearer ${token}`}});
  } else throw new Error(`附件 ${att.name || ''} 没有可下载地址`);
  if (!response.ok) throw new Error(`附件 ${att.name || ''} 下载失败（HTTP ${response.status}）`);
  return Buffer.from(await response.arrayBuffer());
}

async function createOrder(data) {
  const errors = validatePayload(data);
  if (errors.length) throw new Error(errors.join('\n'));
  if (data.source === 'feishu' && safeText(data.source_record_id,200)) {
    const existing = (await listOrders()).find(x=>x.sourceRecordId===safeText(data.source_record_id,200));
    if (existing) throw new Error(`这条飞书记录已经建立过订单：${existing.orderId}，已阻止重复收单。`);
  }
  const orderId = await nextOrderId();
  const orderDir = path.join(ordersRoot(), orderId);
  const inputDir = path.join(orderDir, 'input');
  await fsp.mkdir(inputDir, {recursive: true});
  const refs = [];
  let index = 0;
  try {
    for (const photo of data.photos || []) {
      const targetName = cleanFilename(photo.name || '', index++);
      const raw = String(photo.data || '').replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(raw, 'base64');
      if (!buffer.length || buffer.length > 25 * 1024 * 1024) throw new Error(`图片 ${photo.name || targetName} 无效或超过 25MB。`);
      await fsp.writeFile(path.join(inputDir, targetName), buffer, {flag: 'wx'});
      refs.push(`input/${targetName}`);
    }
    let token = '';
    if ((data.attachments || []).length) {
      const cfg = data.feishu || {};
      token = await feishuToken(cfg.appId, cfg.appSecret);
      for (const att of data.attachments) {
        const targetName = cleanFilename(att.name || '', index++);
        const buffer = await downloadFeishuAttachment(att, token);
        if (buffer.length > 25 * 1024 * 1024) throw new Error(`飞书附件 ${att.name || targetName} 超过 25MB。`);
        await fsp.writeFile(path.join(inputDir, targetName), buffer, {flag: 'wx'});
        refs.push(`input/${targetName}`);
      }
    }
    const order = {
      order_id: orderId,
      pet_name: safeText(data.pet_name, 80),
      pet_type: normalizePetType(data.pet_type),
      reference_photos: refs,
      must_keep_features: splitList(data.must_keep_features),
      must_not_include: splitList(data.must_not_include),
      case_display_authorization: boolValue(data.case_display_authorization, false),
      photo_rights_confirmation: true,
      output_directory: `orders/${orderId}`,
      auto_approve_sample: boolValue(data.auto_approve_sample, false),
      style_profile_id: 'launch-warm-rounded-v1',
    };
    const intake = {
      source: safeText(data.source || 'manual', 30),
      source_record_id: safeText(data.source_record_id, 200),
      xhs_order_id: safeText(data.xhs_order_id, 120),
      customer_nickname: safeText(data.customer_nickname, 120),
      contact: safeText(data.contact, 160),
      notes: safeText(data.notes, 1000),
      received_at: new Date().toISOString(),
    };
    await fsp.writeFile(path.join(orderDir, 'order.json'), JSON.stringify(order, null, 2), {flag: 'wx'});
    await fsp.writeFile(path.join(orderDir, 'intake.json'), JSON.stringify(intake, null, 2), {flag: 'wx'});
    await fsp.writeFile(path.join(orderDir, 'status.json'), JSON.stringify({status:'RECEIVED', updated_at:new Date().toISOString(), history:[{status:'RECEIVED', at:new Date().toISOString(), note:'订单已建档'}]}, null, 2), {flag: 'wx'});
    await writeLedger();
    return {orderId, orderDir, order};
  } catch (error) {
    await fsp.writeFile(path.join(orderDir, 'IMPORT_ERROR.txt'), `${new Date().toISOString()}\n${error.message}\n`).catch(()=>{});
    throw new Error(`${error.message}\n已保留订单目录以便排查：${orderDir}`);
  }
}

async function listOrders() {
  await fsp.mkdir(ordersRoot(), {recursive: true});
  const entries = await fsp.readdir(ordersRoot(), {withFileTypes:true});
  const result = [];
  for (const entry of entries.filter(x=>x.isDirectory()).sort((a,b)=>b.name.localeCompare(a.name, 'zh-CN'))) {
    const dir = path.join(ordersRoot(), entry.name);
    try {
      const order = JSON.parse(await fsp.readFile(path.join(dir, 'order.json'), 'utf8'));
      const status = JSON.parse(await fsp.readFile(path.join(dir, 'status.json'), 'utf8')).status;
      let intake = {};
      try { intake = JSON.parse(await fsp.readFile(path.join(dir, 'intake.json'), 'utf8')); } catch (_) {}
      result.push({orderId: order.order_id, petName: order.pet_name, petType: order.pet_type, status, photoCount: order.reference_photos?.length || 0, xhsOrderId:intake.xhs_order_id||'', customerNickname:intake.customer_nickname||'', source:intake.source||'', sourceRecordId:intake.source_record_id||'', receivedAt:intake.received_at||''});
    } catch (_) {}
  }
  return result;
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

async function writeLedger() {
  const items = await listOrders();
  const outDir = path.join(projectRoot(), 'outputs');
  await fsp.mkdir(outDir,{recursive:true});
  const headers = ['订单编号','小红书订单号','客户昵称','宠物名字','宠物类型','照片数','来源','飞书记录编号','当前状态','收单时间'];
  const rows = items.map(x=>[x.orderId,x.xhsOrderId,x.customerNickname,x.petName,x.petType==='cat'?'猫':'狗',x.photoCount,x.source,x.sourceRecordId,x.status,x.receivedAt]);
  await fsp.writeFile(path.join(outDir,'订单总表-程序同步.csv'),'\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),'utf8');
  await fsp.writeFile(path.join(outDir,'order-index.json'),JSON.stringify(items,null,2),'utf8');
}

function safeOrderDir(orderId) {
  if (!/^PS-\d{8}-\d{3}$/.test(orderId || '')) throw new Error('订单编号格式不正确。');
  const dir = path.resolve(ordersRoot(), orderId);
  if (!dir.startsWith(path.resolve(ordersRoot()) + path.sep)) throw new Error('订单路径越界。');
  return dir;
}

async function validateOrder(orderId) {
  const dir = safeOrderDir(orderId);
  const order = JSON.parse(await fsp.readFile(path.join(dir, 'order.json'), 'utf8'));
  const errors = [];
  const warnings = [];
  if (!order.photo_rights_confirmation) errors.push('未确认照片使用权。');
  const files = await fsp.readdir(path.join(dir, 'input'), {withFileTypes:true});
  const photoFiles = files.filter(x=>x.isFile() && KNOWN_PHOTOS.has(path.extname(x.name).toLowerCase()));
  if (photoFiles.length < 5 || photoFiles.length > 8) errors.push(`照片数量 ${photoFiles.length}，要求 5–8 张。`);
  const heic = photoFiles.filter(x=>['.heic','.heif'].includes(path.extname(x.name).toLowerCase()));
  if (heic.length) errors.push(`有 ${heic.length} 张 HEIC/HEIF；请先转成 JPG、PNG 或 WebP。`);
  for (const file of photoFiles) {
    const stat = await fsp.stat(path.join(dir,'input',file.name));
    if (stat.size < 20 * 1024) warnings.push(`${file.name} 文件较小，请人工确认清晰度。`);
    if (stat.size > 25 * 1024 * 1024) errors.push(`${file.name} 超过 25MB。`);
  }
  return {ok: !errors.length, errors, warnings, visualChecks:['至少两张清晰正脸','至少一张侧脸','至少一张全身','单只宠物且主体明确','无遮挡、不过暗、不过度美颜']};
}

async function updateStatus(orderId, status, note) {
  const file = path.join(safeOrderDir(orderId), 'status.json');
  let data = {status:'RECEIVED', history:[]};
  try { data = JSON.parse(await fsp.readFile(file,'utf8')); } catch (_) {}
  data.status = status; data.updated_at = new Date().toISOString(); data.history ||= [];
  data.history.push({status, at:data.updated_at, note});
  await fsp.writeFile(file, JSON.stringify(data,null,2));
  await writeLedger();
}

function productionPrompt(orderId, mode) {
  const phase = mode === 'full' ? '继续完整生产流程，严格遵守每个暂停点；若身份卡或试作尚未获人工确认，必须停下并说明下一步。' : '只推进到身份卡和“开心、委屈”两张无字试作；完成后停下等待人工确认，不要生成剩余八张。';
  return `请使用项目内 pet-sticker-studio Skill 处理订单 ${orderId}。先完整读取 Skill 说明以及订单目录 orders/${orderId}/order.json，严格按状态机、授权、输入检查、身份一致性和质检规范执行。${phase} 所有产出只能写入 orders/${orderId}，不得覆盖已有文件。每推进或暂停一个阶段，请同步更新 orders/${orderId}/status.json，并在最终答复中给出当前状态、产物路径和需要人工确认的事项。`;
}

function codexRuntime() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const cli = path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const node = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');
  if (!fs.existsSync(cli)) throw new Error('未找到 Codex 命令。请先安装并登录 Codex，然后重启本程序。');
  if (!fs.existsSync(node)) throw new Error('未找到 Node.js 运行环境，无法启动本机 Codex。');
  return {node, cli};
}

async function startJob(orderId, mode) {
  const validation = await validateOrder(orderId);
  if (!validation.ok) throw new Error(`订单未通过开工检查：\n${validation.errors.join('\n')}`);
  if ([...jobs.values()].some(j=>j.running)) throw new Error('已有生产任务运行中，请等待完成后再启动下一单。');
  const {node, cli} = codexRuntime();
  const jobId = crypto.randomUUID();
  const logFile = path.join(safeOrderDir(orderId), `codex-${mode}-${Date.now()}.log`);
  const job = {jobId, orderId, mode, running:true, exitCode:null, startedAt:new Date().toISOString(), lines:[], logFile};
  jobs.set(jobId, job);
  await updateStatus(orderId, mode === 'full' ? 'BATCH_GENERATION' : 'PILOT_GENERATION', `由生产台启动 ${mode} 流程`);
  const args = [cli, 'exec', '-C', projectRoot(), '--sandbox', 'workspace-write', '--approve-for-me', '--skip-git-repo-check', '--color', 'never', '-'];
  const child = spawn(node, args, {cwd:projectRoot(), windowsHide:true, env:{...process.env}});
  const log = fs.createWriteStream(logFile, {flags:'a'});
  const capture = chunk => {
    const text = chunk.toString('utf8'); log.write(text);
    job.lines.push(...text.split(/\r?\n/).filter(Boolean));
    if (job.lines.length > 250) job.lines.splice(0, job.lines.length - 250);
  };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  child.on('error', async err => {capture(`启动失败：${err.message}`); job.running=false; job.error=err.message; log.end(); await updateStatus(orderId,'ERROR',err.message).catch(()=>{});});
  child.on('close', async code => {job.running=false; job.exitCode=code; job.finishedAt=new Date().toISOString(); log.end(); if(code!==0) await updateStatus(orderId,'ERROR',`Codex 退出码 ${code}`).catch(()=>{});});
  child.stdin.end(productionPrompt(orderId, mode));
  return job;
}

async function openFolder(orderId) {
  const dir = safeOrderDir(orderId);
  spawn('explorer.exe', [dir], {detached:true, windowsHide:false, stdio:'ignore'}).unref();
  return dir;
}

function authorized(req, url) {
  if (url.pathname === '/' && url.searchParams.get('token') === SESSION_TOKEN) return true;
  return req.headers['x-pet-session'] === SESSION_TOKEN;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  if (!authorized(req, url)) return json(res, 403, {error:'本地会话已失效，请重新打开程序。'});
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const body = loadUi().replaceAll('__SESSION_TOKEN__', SESSION_TOKEN);
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'"});
      return res.end(body);
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res,200,{appName:APP_NAME,projectRoot:projectRoot(),codexAvailable:(()=>{try{codexRuntime();return true}catch(_){return false}})(),orders:await listOrders()});
    if (req.method === 'POST' && url.pathname === '/api/feishu/records') {
      const data = await readJson(req); const parsed=parseFeishuLink(data.baseUrl||''); const config={...data,appToken:data.appToken||parsed.appToken,tableId:data.tableId||parsed.tableId}; const result = await listFeishuRecords(config);
      return json(res,200,{records:result.records,fields:result.fields,writebackReady:result.fields.some(x=>x.field_name==='表单状态')&&result.fields.some(x=>x.field_name==='本地订单编号')});
    }
    if (req.method === 'POST' && url.pathname === '/api/feishu/inspect') return json(res,200,await inspectFeishu(await readJson(req)));
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const data=await readJson(req); const created=await createOrder(data); let writeback=null;
      if(data.source==='feishu'&&data.source_record_id&&data.feishu){
        try{writeback=await updateFeishuRecord(data.feishu,data.source_record_id,created.orderId)}
        catch(error){writeback={updated:false,warning:`本地订单已建立，但飞书回写失败：${error.message}`}}
      }
      return json(res,201,{...created,writeback});
    }
    if (req.method === 'POST' && url.pathname === '/api/validate') {const data=await readJson(req);return json(res,200,await validateOrder(data.orderId));}
    if (req.method === 'POST' && url.pathname === '/api/run') {const data=await readJson(req);return json(res,202,await startJob(data.orderId,data.mode==='full'?'full':'pilot'));}
    if (req.method === 'POST' && url.pathname === '/api/open-folder') {const data=await readJson(req);return json(res,200,{path:await openFolder(data.orderId)});}
    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {const id=url.pathname.split('/').pop();const job=jobs.get(id);return job?json(res,200,job):json(res,404,{error:'任务不存在或程序已重启。'});}
    return json(res,404,{error:'未找到该功能。'});
  } catch (error) { return json(res,400,{error:error.message || String(error)}); }
}

function openBrowser(url) {
  if (process.argv.includes('--no-browser')) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c','start','',url] : [url];
  spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true}).unref();
}

async function selfTest() {
  const ui = loadUi();
  const realRoot = projectRoot();
  const checks = [
    ['界面资源', ui.includes('宠物表情包生产台')],
    ['飞书字段映射', normalizeFeishuRecord({record_id:'rec1',fields:{'宠物名字':'团子','宠物类型':'猫','照片权利确认':'是'}}).pet_type === 'cat'],
    ['飞书链接解析', parseFeishuLink('https://demo.feishu.cn/base/appABC?table=tblXYZ&view=vew1').appToken === 'appABC' && parseFeishuLink('https://demo.feishu.cn/base/appABC?table=tblXYZ').tableId === 'tblXYZ'],
    ['项目目录', fs.existsSync(path.join(projectRoot(),'pet-sticker-studio','SKILL.md'))],
    ['订单目录', fs.existsSync(ordersRoot())],
  ];
  let tempRoot = '';
  try {
    const sample = await fsp.readFile(path.join(realRoot, 'reference', '奶牛贱贱猫.jpg'));
    tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'pet-meme-selftest-'));
    process.env.PET_MEME_PROJECT_ROOT = tempRoot;
    await fsp.mkdir(path.join(tempRoot, 'orders'), {recursive:true});
    const created = await createOrder({
      source:'feishu', source_record_id:'rec-self-test', pet_name:'测试宠物', pet_type:'cat',
      photo_rights_confirmation:true, case_display_authorization:false,
      photos:Array.from({length:5},(_,i)=>({name:`sample-${i+1}.jpg`,data:sample.toString('base64')})),
    });
    const validation = await validateOrder(created.orderId);
    checks.push(['订单建档与开工检查', validation.ok && fs.existsSync(path.join(created.orderDir,'order.json'))]);
    let duplicateBlocked = false;
    try {
      await createOrder({source:'feishu',source_record_id:'rec-self-test',pet_name:'重复订单',pet_type:'cat',photo_rights_confirmation:true,photos:Array.from({length:5},(_,i)=>({name:`duplicate-${i+1}.jpg`,data:sample.toString('base64')}))});
    } catch (error) { duplicateBlocked = /已经建立过订单/.test(error.message); }
    checks.push(['飞书重复收单拦截',duplicateBlocked]);
  } catch (_) { checks.push(['订单建档与开工检查', false]); }
  finally {
    process.env.PET_MEME_PROJECT_ROOT = realRoot;
    if (tempRoot && tempRoot.startsWith(os.tmpdir())) await fsp.rm(tempRoot,{recursive:true,force:true}).catch(()=>{});
  }
  for (const [name, ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if (checks.some(x=>!x[1])) process.exitCode=1;
}

if (process.argv.includes('--self-test')) selfTest().catch(e=>{console.error(e);process.exitCode=1;});
else {
  const server = http.createServer((req,res)=>handle(req,res));
  server.listen(0,HOST,()=>{const port=server.address().port;const url=`http://${HOST}:${port}/?token=${SESSION_TOKEN}`;console.log(`${APP_NAME} 已启动：${url}`);openBrowser(url);});
}
