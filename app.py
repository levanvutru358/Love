from flask import Flask, render_template

# Serve CSS/JS from the templates folder at /static
app = Flask(__name__, static_folder='templates', static_url_path='/static')


@app.get('/')
def index():
    return render_template('index.html')


@app.get('/health')
def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    # Runs on http://127.0.0.1:5173
    app.run(debug=True, port=5173)
