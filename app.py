from flask import Flask, render_template

# Serve static files from project root to avoid moving existing assets
app = Flask(__name__, static_folder='.', static_url_path='')


@app.get('/')
def index():
    return render_template('index.html')


@app.get('/health')
def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    # Runs on http://127.0.0.1:5173
    app.run(debug=True, port=5173)

