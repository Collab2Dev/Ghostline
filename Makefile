APP_NAME=Ghostline
APP_BUNDLE=$(APP_NAME).app
CONTENTS=$(APP_BUNDLE)/Contents
MACOS=$(CONTENTS)/MacOS
RESOURCES=$(CONTENTS)/Resources
BUILD_PATH=.build/release/GhostlineDesktop

all: app

app:
	swift build -c release
	mkdir -p $(MACOS)
	mkdir -p $(RESOURCES)
	cp $(BUILD_PATH) $(MACOS)/
	cp Sources/GhostlineDesktop/Info.plist $(CONTENTS)/
	cp Sources/GhostlineDesktop/AppIcon.icns $(RESOURCES)/
	cp -R public $(RESOURCES)/
	codesign --deep --force --sign - $(APP_BUNDLE)
	zip -r Ghostline-mac.zip $(APP_BUNDLE)

clean:
	rm -rf .build $(APP_BUNDLE) Ghostline-mac.zip
