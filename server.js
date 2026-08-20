const path = require('path');
const fs = require('fs');
const express = require('express');
const { JsonDB, Config } = require('node-json-db');
const session = require('express-session');
const flash = require('express-flash');

const app = express();

// Inisialisasi Database JSON (Otomatis membuat file database.json)
const db = new JsonDB(new Config("database", true, true, '/'));

// Inisialisasi Data Awal jika database masih kosong
async function initDB() {
    try {
        await db.getData("/links");
    } catch(error) {
        await db.push("/links", []);
    }
}
initDB();

// Konfigurasi Express (Menggunakan Port 8091)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'kunci-rahasia-alfattah',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());
app.use(express.static(path.join(__dirname, 'public')));

// DATA LOGIN ADMIN
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_MURNI = 'adminalfattah';

// Middleware Cek Login Admin
function authAdmin(req, res, next) {
    if (req.session.isAdmin) {
        return next();
    }
    res.redirect('/login');
}

// ROUTE 1: Halaman Utama
app.get('/', async (req, res) => {
    const links = await db.getData("/links");
    const reversedLinks = [...links].reverse();
    res.render('index', { links: reversedLinks, isAdmin: req.session.isAdmin || false });
});

// RUTE KHUSUS BYPASS PROXY UNTUK GAMBAR BACKGROUND
app.get('/jalur-aman-bg.png', (req, res) => {
    const imagePath = path.join(__dirname, 'public', 'background.png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = fs.createReadStream(imagePath);
    stream.on('error', (err) => {
        res.status(404).send('Gambar tidak ditemukan');
    });
    stream.pipe(res);
});

// ROUTE 2: Tambah Link
app.post('/add-link', authAdmin, async (req, res) => {
    const { nama_album, url_link, password } = req.body;
    if (nama_album && url_link) {
        const newLink = {
            id: Date.now().toString(),
            nama_album,
            url_link,
            password: password || "" // Pastikan baris ini ada
        };
        await db.push("/links[]", newLink);
    }
    res.redirect('/');
});

// ROUTE 3: Edit Link (Sudah diperbarui dengan password & dibersihkan dari duplikasi)
app.post('/edit-link/:id', authAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nama_album, url_link, password } = req.body;

        const links = await db.getData("/links");
        const index = links.findIndex(l => l.id === id);

        if (index !== -1) {
            links[index].nama_album = nama_album;
            links[index].url_link = url_link;
            links[index].password = password || "";

            await db.push("/links", links);
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error Edit:", error);
        res.status(500).send("Gagal mengedit link");
    }
});

// ROUTE 4: Hapus Link
app.post('/delete-link/:id', authAdmin, async (req, res) => {
    const links = await db.getData("/links");
    const filteredLinks = links.filter(link => link.id !== req.params.id);
    await db.push("/links", filteredLinks);
    res.redirect('/');
});

// ROUTE 5: Halaman Login
app.get('/login', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/');
    res.render('login', { messages: req.flash('error') });
});

// ROUTE 6: Proses Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD_MURNI) {
        req.session.isAdmin = true;
        res.redirect('/');
    } else {
        req.flash('error', 'Username atau Password salah!');
        res.redirect('/login');
    }
});

// ROUTE 7: Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ROUTE 8: Mengubah Urutan Posisi Album
app.post('/urutan-link/:id/:arah', authAdmin, async (req, res) => {
    try {
        const { id, arah } = req.params;

        const links = await db.getData("/links");
        const index = links.findIndex(l => l.id === id);

        if (index !== -1) {
            if (arah === 'naik' && index < links.length - 1) {
                [links[index], links[index + 1]] = [links[index + 1], links[index]];
            } else if (arah === 'turun' && index > 0) {
                [links[index], links[index - 1]] = [links[index - 1], links[index]];
            }

            await db.push("/links", links);
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error Urutan:", error);
        res.status(500).send("Gagal mengubah urutan");
    }
});

// ROUTE 9: Verifikasi Sandi Album
app.post('/verify-album/:id', async (req, res) => {
    try {
        const { input_password } = req.body;
        const links = await db.getData("/links");
        const album = links.find(l => l.id === req.params.id);

        if (!album) return res.status(404).send("Album tidak ditemukan");

        if (album.password === "" || input_password === album.password) {
            return res.redirect(album.url_link);
        } else {
            res.send("Sandi salah! <a href='/'>Kembali</a>");
        }
    } catch (error) {
        res.status(500).send("Terjadi kesalahan sistem");
    }
});

// Menjalankan Server pada Port 8091
app.listen(8091, () => {
    console.log('Server Alfattah berjalan di http://localhost:8091');
});

