APP_NAME=Ghostline
APP_BUNDLE=$(APP_NAME).app
CONTENTS=$(APP_BUNDLE)/Contents
MACOS=$(CONTENTS)/MacOS
RESOURCES=$(CONTENTS)/Resources
BUILD_PATH=.build/release/GhostlineDesktop
DMG_NAME=$(APP_NAME)-mac.dmg
ZIP_NAME=$(APP_NAME)-mac.zip
DIST_DIR=.dist
DMG_STAGING=$(DIST_DIR)/dmg
DEVELOPER_DIR ?= /Applications/Xcode.app/Contents/Developer
MODULE_CACHE=$(CURDIR)/.build/clang-module-cache
SWIFT_BUILD=DEVELOPER_DIR=$(DEVELOPER_DIR) CLANG_MODULE_CACHE_PATH=$(MODULE_CACHE) swift build

all: dmg

app:
	mkdir -p $(MODULE_CACHE)
	$(SWIFT_BUILD) -c release
	rm -rf $(APP_BUNDLE)
	mkdir -p $(MACOS)
	mkdir -p $(RESOURCES)
	cp $(BUILD_PATH) $(MACOS)/
	cp Sources/GhostlineDesktop/Info.plist $(CONTENTS)/
	cp Sources/GhostlineDesktop/AppIcon.icns $(RESOURCES)/
	cp -R public $(RESOURCES)/
	codesign --deep --force --sign - $(APP_BUNDLE)

zip: app
	rm -f $(ZIP_NAME)
	zip -r $(ZIP_NAME) $(APP_BUNDLE)

dmg: app
	rm -rf $(DIST_DIR) $(DMG_NAME)
	mkdir -p $(DMG_STAGING)
	cp -R $(APP_BUNDLE) $(DMG_STAGING)/
	ln -s /Applications $(DMG_STAGING)/Applications
	hdiutil create -volname "$(APP_NAME)" -srcfolder $(DMG_STAGING) -ov -format UDZO $(DMG_NAME)

clean:
	rm -rf .build $(APP_BUNDLE) $(ZIP_NAME) $(DMG_NAME) $(DIST_DIR)
