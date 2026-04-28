require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'AirplayPlugin'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/cresci/trailer-roulette-ios'
  s.author = { 'Charlie Cresci' => 'crescicharles@gmail.com' }
  s.source = { git: 'https://github.com/cresci/trailer-roulette-ios.git', tag: s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m}'
  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
