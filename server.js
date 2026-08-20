const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('express-flash');

const app = express();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Berhasil terhubung ke MongoDB Atlas Cloud!'))
  .catch(err => console.error('Koneksi database gagal:', err));

// Tambahkan field 'urutan' pada skema
const linkSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    nama_album: { type: String, required: true },
    url_link: { type: String, required: true },
    password: { type: String, default: "" },
    urutan: { type: Number, default: 0 }
});

const LinkModel = mongoose.model('Link', linkSchema);

const PORT = process.env.PORT || 8091;
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

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_MURNI = 'adminalfattah';

function authAdmin(req, res, next) {
    if (req.session.isAdmin) return next();
    res.redirect('/login');
}

// Urutkan berdasarkan field 'urutan' secara ascending (terkecil di atas)
app.get('/', async (req, res) => {
    try {
        const links = await LinkModel.find().sort({ urutan: 1, _id: -1 });
        res.render('index', { links: links, isAdmin: req.session.isAdmin || false });
    } catch (error) {
        console.error("Error memuat data:", error);
        res.render('index', { links: [], isAdmin: req.session.isAdmin || false });
    }
});

app.get('/jalur-aman-bg.png', (req, res) => {
    const imagePath = path.join(__dirname, 'public', 'background.png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(imagePath);
    stream.on('error', () => res.status(404).send('Gambar tidak ditemukan'));
    stream.pipe(res);
});

app.post('/add-link', authAdmin, async (req, res) => {
    try {
        const { nama_album, url_link, password } = req.body;
        if (nama_album && url_link) {
            const count = await LinkModel.countDocuments();
            const newLink = new LinkModel({
                id: Date.now().toString(),
                nama_album,
                url_link,
                password: password || "",
                urutan: count + 1
            });
            await newLink.save();
        }
        res.redirect('/');
    } catch (error) {
        console.error("Gagal menambah link:", error);
        res.status(500).send("Gagal menyimpan data ke database cloud");
    }
});

app.post('/edit-link/:id', authAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nama_album, url_link, password } = req.body;
        await LinkModel.findOneAndUpdate(
            { id: id },
            { nama_album, url_link, password: password || "" }
        );
        res.redirect('/');
    } catch (error) {
        console.error("Error Edit:", error);
        res.status(500).send("Gagal mengedit link");
    }
});

// ROUTE NAIK (Menukar nomor urut dengan data di atasnya)
app.post('/urutan-link/:id/naik', authAdmin, async (req, res) => {
    try {
        let links = await LinkModel.find().sort({ urutan: 1, _id: -1 });
        const index = links.findIndex(l => l.id === req.params.id);

        if (index > 0) {
            // Tukar nomor urut dengan elemen sebelumnya
            const currentUrutan = links[index].urutan;
            const targetUrutan = links[index - 1].urutan;

            if (currentUrutan === targetUrutan) {
                // Jika urutannya sama, atur ulang semua index dari awal
                for (let i = 0; i < links.length; i++) {
                    links[i].urutan = i + 1;
                }
                const temp = links[index].urutan;
                links[index].urutan = links[index - 1].urutan;
                links[index - 1].urutan = temp;
            } else {
                await LinkModel.updateOne({ id: links[index].id }, { urutan: targetUrutan });
                await LinkModel.updateOne({ id: links[index - 1].id }, { urutan: currentUrutan });
            }

            // Simpan perubahan indeks seluruh array ke database agar rapi
            for (let i = 0; i < links.length; i++) {
                if (i !== index && i !== index - 1) {
                    await LinkModel.updateOne({ id: links[i].id }, { urutan: i + 1 });
                } else if (i === index) {
                    await LinkModel.updateOne({ id: links[index].id }, { urutan: targetUrutan });
                } else if (i === index - 1) {
                    await LinkModel.updateOne({ id: links[index - 1].id }, { urutan: currentUrutan });
                }
            }
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error naik:", error);
        res.status(500).send("Gagal mengubah urutan naik");
    }
});

// ROUTE TURUN (Menukar nomor urut dengan data di bawahnya)
app.post('/urutan-link/:id/turun', authAdmin, async (req, res) => {
    try {
        let links = await LinkModel.find().sort({ urutan: 1, _id: -1 });
        const index = links.findIndex(l => l.id === req.params.id);

        if (index >= 0 && index < links.length - 1) {
            for (let i = 0; i < links.length; i++) {
                await LinkModel.updateOne({ id: links[i].id }, { urutan: i + 1 });
            }
            // Setelah dinomori ulang secara berurutan, tukar dengan yang di bawahnya (+1)
            const currentId = links[index].id;
            const nextId = links[index + 1].id;

            await LinkModel.updateOne({ id: currentId }, { urutan: index + 2 });
            await LinkModel.updateOne({ id: nextId }, { urutan: index + 1 });
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error turun:", error);
        res.status(500).send("Gagal mengubah urutan turun");
    }
});

app.post('/delete-link/:id', authAdmin, async (req, res) => {
    try {
        await LinkModel.findOneAndDelete({ id: req.params.id });
        res.redirect('/');
    } catch (error) {
        console.error("Error Hapus:", error);
        res.status(500).send("Gagal menghapus data");
    }
});

app.get('/login', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/');
    res.render('login', { messages: req.flash('error') });
});

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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.post('/verify-album/:id', async (req, res) => {
    try {
        const { input_password } = req.body;
        const album = await LinkModel.findOne({ id: req.params.id });
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

app.listen(PORT, () => {
    console.log(`Server Alfattah berjalan di port ${PORT}`);
});

